import pytest
from backend.ai.planning.plan_validator import validate, as_option
from backend.ai.planning.planner import plan
from backend.database.database import Database
from backend.simulation.engine import Simulation
from backend.simulation.graph import Graph
from conftest import medical


def assert_valid(world):
    reserved = []
    for a in world.plan.assignments:
        assert validate(a, world, Graph(world), reserved) == []
        reserved.append(as_option(a, world))
    assert len({a.resource_id for a in world.plan.assignments}) == len(world.plan.assignments)
    for h in world.hospitals.values():
        assert h.occupied_beds <= h.total_beds and h.occupied_icu <= h.icu_beds


def test_road_invalidates_and_repairs_only_affected_plans(sim):
    sim.demo()
    w = sim.world
    target = next(a for a in w.plan.assignments if a.resource_id == 'FIRE-01')
    road = Graph(w).edge(*target.route.path[:2])
    unaffected = [a.model_dump() for a in w.plan.assignments if road.id not in [Graph(w).edge(x, y).id
        for r in [a.route, a.transport_route] if r for x, y in zip(r.path, r.path[1:])]]
    sim.change('road-block', {'road_id': road.id})
    assert_valid(w)
    assert w.plan.stats['invalidated'] >= 1
    assert all(any(a.model_dump() == old for a in w.plan.assignments) for old in unaffected)
    assert any(d.algorithm == 'PlanValidator' and 'blocked' in str(d.evidence) for d in w.decisions)


def test_hospital_capacity_reassigns_patient(sim):
    medical(sim, location='N03')
    assert sim.world.plan.assignments[0].hospital_id == 'H1'
    sim.change('hospital-change', {'hospital_id': 'H1', 'icu_beds': 1})
    assert sim.world.plan.assignments[0].hospital_id == 'H2'
    assert_valid(sim.world)


def test_vehicle_failure_reassigns_and_restore_works(sim):
    medical(sim)
    before = sim.world.plan.assignments[0].resource_id
    sim.change('vehicle-failure', {'resource_id': before})
    assert sim.world.plan.assignments[0].resource_id != before
    assert not sim.world.resources[before].available
    assert_valid(sim.world)
    sim.change('vehicle-restore', {'resource_id': before})
    assert sim.world.resources[before].available


def test_new_critical_emergency_preempts_lower_priority(sim):
    sim.world.resources['AMB-02'].available = False
    medical(sim, id='LOW', severity=1, critical=0)
    medical(sim, id='HIGH', severity=5, critical=1)
    assert sim.world.plan.assignments[0].incident_id == 'HIGH'
    assert 'LOW-P1' in sim.world.plan.unassigned
    assert_valid(sim.world)


def test_no_hospital_and_no_routes_report_failure(sim):
    for h in sim.world.hospitals.values():
        h.available = False
    medical(sim)
    assert not sim.world.plan.assignments
    assert 'unavailable' in sim.world.plan.unassigned['MED-P1']
    for h in sim.world.hospitals.values():
        h.available = True
    for r in sim.world.roads.values():
        r.blocked = True
    plan(sim.world)
    assert 'unreachable' in sim.world.plan.unassigned['MED-P1']


def test_demo_end_to_end_invariants(sim):
    sim.demo()
    initial_routes = {a.resource_id: a.route.path[:] for a in sim.world.plan.assignments}
    for _ in range(220):
        sim.tick()
        assert_valid(sim.world)
    w = sim.world
    assert w.demo_step == 5
    assert len(w.incidents) == 2
    assert any(e.type == 'road_discovered' for e in w.events)
    assert any(d.algorithm == 'PlanValidator' for d in w.decisions)
    assert sum(p.status == 'ADMITTED' for p in w.patients.values()) >= 2
    assert w.plan.unassigned  # capacity shortage is a visible, truthful outcome
    assert initial_routes
    sim.reset()
    assert not sim.world.incidents and not sim.world.plan.assignments and sim.world.time == 0


def test_onboard_patient_keeps_custody_during_hospital_repair(sim):
    medical(sim, location='N02')
    sim.world.running = True
    for _ in range(14):
        sim.tick()
    a = sim.world.plan.assignments[0]
    assert a.phase == 'TRANSPORTING'
    resource_id, patient_id = a.resource_id, a.patient_id
    sim.change('hospital-change', {'hospital_id': a.hospital_id, 'available': False})
    a = sim.world.plan.assignments[0]
    assert a.resource_id == resource_id and a.phase == 'TRANSPORTING' and a.patient_id == patient_id
    assert_valid(sim.world)


def test_onboard_vehicle_failure_uses_current_location(sim):
    medical(sim, location='N02')
    sim.world.running = True
    for _ in range(28):
        sim.tick()
    a = sim.world.plan.assignments[0]
    assert a.phase == 'TRANSPORTING'
    location, patient = sim.world.resources[a.resource_id].location, a.patient_id
    sim.change('vehicle-failure', {'resource_id': a.resource_id})
    assert sim.world.patients[patient].location == location
    replacement = next(a for a in sim.world.plan.assignments if a.patient_id == patient)
    assert replacement.route.path[-1] == location
    assert_valid(sim.world)


def test_sqlite_survives_restart(tmp_path):
    path = tmp_path / 'world.sqlite3'
    db = Database(path)
    sim = Simulation(db)
    sim.demo()
    expected = sim.world.model_dump()
    db.close()
    db = Database(path)
    restored = Simulation(db)
    assert restored.world.incidents['FACTORY-FIRE'].type == 'INDUSTRIAL'
    assert restored.world.plan.model_dump() == expected['plan']
    assert not restored.world.running
    assert db.connection.execute('SELECT COUNT(*) FROM decisions').fetchone()[0] > 0
    db.close()


def test_reopen_and_severity_change(sim):
    medical(sim, critical=0, severity=2)
    sim.change('incident-change', {'incident_id': 'MED', 'severity': 5})
    assert sim.world.incidents['MED'].priority == 5
    sim.change('road-block', {'road_id': 'N00-N01'})
    sim.change('road-reopen', {'road_id': 'N00-N01'})
    assert not sim.world.roads['N00-N01'].blocked
    assert_valid(sim.world)


def test_invalid_hospital_change_is_atomic(sim):
    before = sim.world.model_dump()
    with pytest.raises(ValueError):
        sim.change('hospital-change', {'hospital_id': 'H1', 'total_beds': 0})
    assert sim.world.model_dump() == before


def test_deadline_constraint(sim):
    medical(sim)
    sim.world.time = 500
    plan(sim.world, 'Deadline exceeded')
    assert not sim.world.plan.assignments
    assert 'deadline' in sim.world.plan.unassigned['MED-P1']
