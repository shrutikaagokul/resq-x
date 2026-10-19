"""The expanded districts participate in the same simulation and persistence."""
import pytest
from backend.simulation.city import seed_world, expand_city
from backend.simulation.graph import Graph
from backend.simulation.engine import Simulation
from backend.database.database import Database
from conftest import medical


def test_expanded_graph_preserves_core_and_connects_every_district():
    world = seed_world()
    assert len(world.nodes) == 81
    assert len(world.roads) == 136
    for row in range(5):
        for col in range(5):
            node = world.nodes[f'N{row}{col}']
            assert (node.x, node.z) == ((col-2)*12, (row-2)*12)
            for dr, dc in ((0, 1), (1, 0)):
                if row+dr < 5 and col+dc < 5:
                    road = world.roads[f'N{row}{col}-N{row+dr}{col+dc}']
                    assert road.distance == 12
                    assert road.travel_time == 5 + (row+col) % 3
    graph = Graph(world)
    reached, pending = set(), ['N22']
    while pending:
        node = pending.pop()
        if node not in reached:
            reached.add(node)
            pending.extend(n for n, _ in graph.neighbors(node))
    assert reached == set(world.nodes)
    assert len(world.hospitals) == 4
    for hospital in world.hospitals.values():
        assert hospital.location in reached
        assert any(b.id == hospital.id and b.kind == 'hospital' for b in world.buildings)
    before = world.model_dump()
    expand_city(world)
    assert world.model_dump() == before


@pytest.mark.parametrize('hospital_id', ['H3', 'H4'])
def test_new_hospitals_receive_real_patients_and_enforce_icu(sim, hospital_id):
    for hospital in sim.world.hospitals.values():
        hospital.available = hospital.id == hospital_id
    hospital = sim.world.hospitals[hospital_id]
    medical(sim, location=hospital.location)
    assert not sim.world.plan.assignments  # Initially occupied ICU cannot be reserved.
    sim.change('hospital-change', {'hospital_id': hospital_id, 'occupied_icu': hospital.occupied_icu-1})
    assert sim.world.plan.assignments[0].hospital_id == hospital_id
    assert sim.world.plan.assignments[0].transport_route.path[-1] == hospital.location
    before = hospital.occupied_beds
    sim.world.running = True
    for _ in range(300):
        sim.tick()
    assert sim.world.patients['MED-P1'].status == 'ADMITTED'
    admitted_to = sim.world.hospitals[hospital_id]
    assert admitted_to.occupied_beds == before+1
    assert admitted_to.occupied_icu == admitted_to.icu_beds


def test_legacy_snapshot_upgrade_preserves_live_state(tmp_path):
    db = Database(tmp_path / 'legacy.sqlite3')
    sim = Simulation(db)
    world = sim.world
    world.nodes = {k: v for k, v in world.nodes.items() if k.startswith('N')}
    world.roads = {k: v for k, v in world.roads.items() if v.a in world.nodes and v.b in world.nodes}
    world.hospitals = {k: v for k, v in world.hospitals.items() if k in ('H1', 'H2')}
    world.buildings = [b for b in world.buildings if b.id not in ('H3', 'H4') and not b.id.startswith('DISTRICT')]
    world.layout_version = 1
    world.time = 123
    world.roads['N00-N01'].blocked = True
    world.hospitals['H1'].occupied_beds = 6
    world.resources['RES-01'].location = 'N33'
    medical(sim, critical=0)
    patients = {k: v.model_dump() for k, v in world.patients.items()}
    incidents = {k: v.model_dump() for k, v in world.incidents.items()}
    db.save(world)
    restored = Simulation(db).world
    assert restored.layout_version == 2 and len(restored.nodes) == 81
    assert restored.time == 123
    assert restored.roads['N00-N01'].blocked
    assert restored.hospitals['H1'].occupied_beds == 6
    assert restored.resources['RES-01'].location == 'N33'
    assert {k: v.model_dump() for k, v in restored.patients.items()} == patients
    assert {k: v.model_dump() for k, v in restored.incidents.items()} == incidents
    assert db.load().layout_version == 2
    db.close()
