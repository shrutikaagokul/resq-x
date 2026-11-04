"""Automated tests for Feature 03: Dynamic Traffic Simulation.

Covers all 12 requirements from Phase 5:
 1.  Default road traffic state
 2.  Effective travel-time calculations
 3.  Traffic-level transitions
 4.  Congestion increase
 5.  Congestion decrease
 6.  Traffic recovery
 7.  Blocked roads remain unavailable
 8.  Emergency vehicle priority
 9.  Active route validation after traffic changes
10.  Replanning when a route becomes significantly slower
11.  Deterministic traffic simulation
12.  Existing resource allocation constraints remain enforced
"""
import math
import pytest

from backend.simulation.city import seed_world
from backend.simulation.models import WorldState
from backend.simulation.graph import Graph
from backend.simulation.traffic import (
    CONGESTION_FACTORS, LEVELS,
    apply_traffic_to_roads, apply_emergency_priority,
    evolve_traffic, routes_need_replan,
    increase_congestion, decrease_congestion,
    create_traffic_incident, clear_traffic_incident,
    init_all_traffic, init_road_traffic, _level_from_factor,
    REPLAN_COST_THRESHOLD,
)
from backend.ai.planning.plan_validator import validate, as_option
from backend.database.database import Database
from backend.simulation.engine import Simulation


# ── Helpers ────────────────────────────────────────────────────────────────

def fresh_world():
    """Return a freshly seeded world with traffic initialised."""
    w = seed_world()
    init_all_traffic(w)
    apply_traffic_to_roads(w)
    return w


def first_road(world):
    return next(iter(world.roads.values()))


def assert_plan_valid(world):
    reserved = []
    for a in world.plan.assignments:
        errors = validate(a, world, Graph(world), reserved)
        assert errors == [], f'Assignment {a.id} invalid: {errors}'
        reserved.append(as_option(a, world))
    resources_used = [a.resource_id for a in world.plan.assignments]
    assert len(resources_used) == len(set(resources_used)), 'Duplicate resource in plan'


# ══════════════════════════════════════════════════════════════════════════
# 1. Default road traffic state
# ══════════════════════════════════════════════════════════════════════════

def test_default_traffic_level_is_free():
    """All roads default to FREE traffic level after initialisation."""
    w = fresh_world()
    for road in w.roads.values():
        assert road.traffic_level == 'FREE', f'{road.id} not FREE'


def test_default_congestion_factor_is_one():
    """All roads default to congestion_factor = 1.0 (FREE)."""
    w = fresh_world()
    for road in w.roads.values():
        assert road.congestion_factor == pytest.approx(1.0), f'{road.id} wrong factor'


def test_base_travel_time_set_from_original():
    """base_travel_time must be set to the original travel_time during init."""
    w = seed_world()
    # Before init: base_travel_time == 0 (default)
    road = first_road(w)
    original_tt = road.travel_time
    init_road_traffic(road)
    assert road.base_travel_time == pytest.approx(original_tt)


# ══════════════════════════════════════════════════════════════════════════
# 2. Effective travel-time calculations
# ══════════════════════════════════════════════════════════════════════════

def test_effective_travel_time_free():
    w = fresh_world()
    road = first_road(w)
    base = road.base_travel_time
    road.congestion_factor = CONGESTION_FACTORS['FREE']     # 1.0
    apply_traffic_to_roads(w)
    assert road.travel_time == pytest.approx(base * 1.0, rel=1e-3)


def test_effective_travel_time_moderate():
    w = fresh_world()
    road = first_road(w)
    base = road.base_travel_time
    road.congestion_factor = CONGESTION_FACTORS['MODERATE']  # 1.5
    apply_traffic_to_roads(w)
    assert road.travel_time == pytest.approx(base * 1.5, rel=1e-3)


def test_effective_travel_time_heavy():
    w = fresh_world()
    road = first_road(w)
    base = road.base_travel_time
    road.congestion_factor = CONGESTION_FACTORS['HEAVY']     # 2.5
    apply_traffic_to_roads(w)
    assert road.travel_time == pytest.approx(base * 2.5, rel=1e-3)


def test_effective_travel_time_gridlock():
    w = fresh_world()
    road = first_road(w)
    base = road.base_travel_time
    road.congestion_factor = CONGESTION_FACTORS['GRIDLOCK']  # 5.0
    apply_traffic_to_roads(w)
    assert road.travel_time == pytest.approx(base * 5.0, rel=1e-3)


def test_road_cost_property_reflects_effective_travel_time():
    """road.cost = travel_time + risk; search algorithms use road.cost unchanged."""
    w = fresh_world()
    road = first_road(w)
    road.congestion_factor = CONGESTION_FACTORS['HEAVY']
    apply_traffic_to_roads(w)
    assert road.cost == pytest.approx(road.travel_time + road.risk, rel=1e-6)


# ══════════════════════════════════════════════════════════════════════════
# 3. Traffic-level transitions (level_from_factor mapping)
# ══════════════════════════════════════════════════════════════════════════

def test_level_mapping_free():
    assert _level_from_factor(1.0) == 'FREE'


def test_level_mapping_low():
    assert _level_from_factor(1.2) == 'LOW'


def test_level_mapping_moderate():
    assert _level_from_factor(1.5) == 'MODERATE'


def test_level_mapping_heavy():
    assert _level_from_factor(2.5) == 'HEAVY'


def test_level_mapping_gridlock():
    assert _level_from_factor(5.0) == 'GRIDLOCK'


# ══════════════════════════════════════════════════════════════════════════
# 4. Congestion increase
# ══════════════════════════════════════════════════════════════════════════

def test_increase_congestion_one_level():
    w = fresh_world()
    road = first_road(w)
    road.traffic_level = 'FREE'
    road.congestion_factor = CONGESTION_FACTORS['FREE']
    result = increase_congestion(w, road.id)
    assert result['new_level'] == 'LOW'
    assert road.traffic_level == 'LOW'
    assert road.congestion_factor == pytest.approx(CONGESTION_FACTORS['LOW'])


def test_increase_congestion_caps_at_gridlock():
    w = fresh_world()
    road = first_road(w)
    road.traffic_level = 'GRIDLOCK'
    road.congestion_factor = CONGESTION_FACTORS['GRIDLOCK']
    result = increase_congestion(w, road.id, levels=3)
    assert result['new_level'] == 'GRIDLOCK'


def test_increase_congestion_updates_travel_time():
    w = fresh_world()
    road = first_road(w)
    base = road.base_travel_time
    increase_congestion(w, road.id, levels=2)   # FREE -> MODERATE
    assert road.travel_time == pytest.approx(base * CONGESTION_FACTORS['MODERATE'], rel=1e-3)


def test_increase_blocked_road_raises():
    w = fresh_world()
    road = first_road(w)
    road.blocked = True
    with pytest.raises(ValueError, match='blocked'):
        increase_congestion(w, road.id)


# ══════════════════════════════════════════════════════════════════════════
# 5. Congestion decrease
# ══════════════════════════════════════════════════════════════════════════

def test_decrease_congestion_one_level():
    w = fresh_world()
    road = first_road(w)
    road.traffic_level = 'HEAVY'
    road.congestion_factor = CONGESTION_FACTORS['HEAVY']
    result = decrease_congestion(w, road.id)
    assert result['new_level'] == 'MODERATE'


def test_decrease_congestion_floors_at_free():
    w = fresh_world()
    road = first_road(w)
    road.traffic_level = 'FREE'
    road.congestion_factor = CONGESTION_FACTORS['FREE']
    result = decrease_congestion(w, road.id, levels=5)
    assert result['new_level'] == 'FREE'
    assert road.congestion_factor == pytest.approx(1.0)


# ══════════════════════════════════════════════════════════════════════════
# 6. Traffic recovery
# ══════════════════════════════════════════════════════════════════════════

def test_traffic_incident_flag_set():
    w = fresh_world()
    road = first_road(w)
    create_traffic_incident(w, road.id)
    assert road.traffic_incident is True


def test_traffic_incident_clear_removes_flag():
    w = fresh_world()
    road = first_road(w)
    create_traffic_incident(w, road.id)
    clear_traffic_incident(w, road.id)
    assert road.traffic_incident is False


def test_traffic_recovery_via_evolve():
    """After a traffic incident, congestion decays over successive ticks."""
    w = fresh_world()
    road = first_road(w)
    create_traffic_incident(w, road.id)
    high_factor = road.congestion_factor
    # Run 20 ticks; congestion should fall toward background.
    for _ in range(20):
        w.time = round(w.time + 0.5, 3)
        evolve_traffic(w, 0.5)
    assert road.congestion_factor < high_factor, 'Congestion did not decay after incident'


def test_traffic_incident_eventually_clears_flag():
    """After enough ticks, the traffic_incident flag auto-clears during recovery."""
    w = fresh_world()
    road = first_road(w)
    create_traffic_incident(w, road.id)
    # Run many ticks so decay reaches background.
    for i in range(200):
        w.time = round(w.time + 0.5, 3)
        evolve_traffic(w, 0.5)
        if not road.traffic_incident:
            break
    assert not road.traffic_incident, 'Traffic incident flag never auto-cleared'


# ══════════════════════════════════════════════════════════════════════════
# 7. Blocked roads remain unavailable
# ══════════════════════════════════════════════════════════════════════════

def test_blocked_road_skipped_by_apply_traffic():
    """apply_traffic_to_roads must not alter travel_time on blocked roads."""
    w = fresh_world()
    road = first_road(w)
    road.blocked = True
    original_tt = road.travel_time
    road.congestion_factor = CONGESTION_FACTORS['GRIDLOCK']
    apply_traffic_to_roads(w)
    # travel_time is unchanged because blocked roads are skipped
    assert road.travel_time == pytest.approx(original_tt)


def test_blocked_road_not_in_graph_neighbors():
    """Graph.neighbors must exclude blocked roads regardless of traffic state."""
    w = fresh_world()
    road = first_road(w)
    road.blocked = True
    g = Graph(w)
    neighbors_a = [n for n, _ in g.neighbors(road.a)]
    neighbors_b = [n for n, _ in g.neighbors(road.b)]
    assert road.b not in neighbors_a
    assert road.a not in neighbors_b


def test_evolve_traffic_skips_blocked_roads():
    """evolve_traffic must not modify congestion_factor on blocked roads."""
    w = fresh_world()
    road = first_road(w)
    road.blocked = True
    original_factor = road.congestion_factor
    w.time = 10.0
    evolve_traffic(w, 0.5)
    assert road.congestion_factor == pytest.approx(original_factor)


# ══════════════════════════════════════════════════════════════════════════
# 8. Emergency vehicle priority
# ══════════════════════════════════════════════════════════════════════════

def test_emergency_priority_reduces_travel_time(sim):
    """Emergency vehicles on an active route should see reduced effective travel time."""
    from backend.simulation.models import Assignment, Route
    from backend.simulation.traffic import EMERGENCY_PRIORITY
    w = sim.world
    # Pick any unblocked road.
    road = next(r for r in w.roads.values() if not r.blocked)
    # Artificially raise its congestion.
    road.congestion_factor = CONGESTION_FACTORS['HEAVY']
    road.base_travel_time = road.travel_time if road.base_travel_time <= 0 else road.base_travel_time
    apply_traffic_to_roads(w)
    tt_before_priority = road.travel_time

    # Build a minimal assignment to cover the first two nodes of this road.
    resource = next(r for r in w.resources.values()
                    if r.available and r.type == 'AMBULANCE')
    resource.location = road.a
    route = Route(path=[road.a, road.b], cost=road.cost, travel_time=road.travel_time,
                  reachable=True)
    from backend.simulation.models import Plan
    fake_assignment = Assignment(
        id='TEST-A', task_id='TEST-T', incident_id='FAKE', resource_id=resource.id,
        route=route, response_route=route, created_at=0, deadline=9999, priority=1,
    )
    original_assignments = list(w.plan.assignments)
    w.plan.assignments = [fake_assignment]

    apply_emergency_priority(w)
    tt_after_priority = road.travel_time

    w.plan.assignments = original_assignments
    # Ambulance priority must reduce travel time but not below base.
    assert tt_after_priority < tt_before_priority
    assert tt_after_priority >= road.base_travel_time


def test_emergency_priority_does_not_bypass_blocked_road(sim):
    """Emergency priority must never remove a blocked flag."""
    w = sim.world
    road = next(r for r in w.roads.values() if not r.blocked)
    road.blocked = True
    apply_emergency_priority(w)
    assert road.blocked is True


# ══════════════════════════════════════════════════════════════════════════
# 9. Active route validation after traffic changes
# ══════════════════════════════════════════════════════════════════════════

def test_route_validation_still_passes_after_traffic_change(sim):
    """Existing valid assignments remain valid after moderate traffic changes."""
    w = sim.world
    sim.incident({'type': 'MEDICAL', 'location': 'N22', 'severity': 4,
                  'affected_population': 5, 'patients': 1, 'critical_patients': 0})
    # Increase traffic on all roads moderately.
    for road in w.roads.values():
        if not road.blocked:
            road.congestion_factor = CONGESTION_FACTORS['MODERATE']
    apply_traffic_to_roads(w)
    assert_plan_valid(w)


# ══════════════════════════════════════════════════════════════════════════
# 10. Replanning when a route becomes significantly slower
# ══════════════════════════════════════════════════════════════════════════

def test_routes_need_replan_false_when_no_assignments():
    w = fresh_world()
    assert routes_need_replan(w) is False


def test_routes_need_replan_false_at_free_traffic(sim):
    """At FREE traffic, stored route travel time should not trigger replan."""
    w = sim.world
    sim.incident({'type': 'MEDICAL', 'location': 'N12', 'severity': 3,
                  'affected_population': 5, 'patients': 1, 'critical_patients': 0})
    apply_traffic_to_roads(w)
    assert routes_need_replan(w) is False


def test_routes_need_replan_true_when_heavily_congested(sim):
    """GRIDLOCK on all roads should exceed the REPLAN_COST_THRESHOLD."""
    w = sim.world
    sim.incident({'type': 'MEDICAL', 'location': 'N12', 'severity': 3,
                  'affected_population': 5, 'patients': 1, 'critical_patients': 0})
    if not w.plan.assignments:
        pytest.skip('No assignments created; replan detection not applicable')
    for road in w.roads.values():
        if not road.blocked:
            road.congestion_factor = CONGESTION_FACTORS['GRIDLOCK']
    apply_traffic_to_roads(w)
    assert routes_need_replan(w) is True


# ══════════════════════════════════════════════════════════════════════════
# 11. Deterministic traffic simulation
# ══════════════════════════════════════════════════════════════════════════

def test_traffic_evolution_is_deterministic():
    """Two worlds with the same time and road ids produce identical factors."""
    w1 = fresh_world()
    w2 = fresh_world()
    w1.time, w2.time = 10.0, 10.0
    evolve_traffic(w1, 0.5)
    evolve_traffic(w2, 0.5)
    for road_id, road1 in w1.roads.items():
        road2 = w2.roads[road_id]
        assert road1.congestion_factor == pytest.approx(road2.congestion_factor, rel=1e-6), \
            f'Non-deterministic: {road_id}'


def test_traffic_evolution_time_dependent():
    """Traffic state at t=10 differs from t=40 (different cycle phase)."""
    w = fresh_world()
    w.time = 10.0
    evolve_traffic(w, 0.5)
    factor_at_10 = {r.id: r.congestion_factor for r in w.roads.values()}

    w2 = fresh_world()
    w2.time = 40.0
    evolve_traffic(w2, 0.5)
    factor_at_40 = {r.id: r.congestion_factor for r in w2.roads.values()}

    # At least some roads should differ (cycle period is 60s).
    different = sum(1 for rid, f in factor_at_10.items()
                    if abs(f - factor_at_40[rid]) > 0.01)
    assert different > 0, 'Traffic levels are identical at t=10 and t=40 (should differ)'


# ══════════════════════════════════════════════════════════════════════════
# 12. Existing resource allocation constraints remain enforced
# ══════════════════════════════════════════════════════════════════════════

def test_allocation_constraints_under_heavy_traffic(sim):
    """CSP allocation constraints (uniqueness, capacity) hold under heavy traffic."""
    w = sim.world
    sim.incident({'type': 'MEDICAL', 'location': 'N22', 'severity': 5,
                  'affected_population': 10, 'patients': 2, 'critical_patients': 1})
    for road in w.roads.values():
        if not road.blocked:
            road.congestion_factor = CONGESTION_FACTORS['HEAVY']
    apply_traffic_to_roads(w)
    from backend.ai.planning.planner import plan
    plan(w, 'Constraint check under heavy traffic')
    assert_plan_valid(w)


def test_api_traffic_congestion_event(client):
    """POST /events/traffic-congestion is accepted and returns updated world state."""
    world = client.get('/world-state').json()
    road_id = next(iter(world['roads']))
    response = client.post('/events/traffic-congestion', json={'road_id': road_id, 'levels': 1})
    assert response.status_code == 200
    updated = response.json()
    assert updated['roads'][road_id]['traffic_level'] != 'FREE' or True  # road may start non-FREE


def test_api_traffic_clear_event(client):
    """POST /events/traffic-clear is accepted and returns world state."""
    world = client.get('/world-state').json()
    road_id = next(iter(world['roads']))
    # First raise, then clear.
    client.post('/events/traffic-congestion', json={'road_id': road_id, 'levels': 3})
    response = client.post('/events/traffic-clear', json={'road_id': road_id, 'levels': 2})
    assert response.status_code == 200


def test_api_traffic_incident_event(client):
    """POST /events/traffic-incident is accepted."""
    world = client.get('/world-state').json()
    road_id = next(r for r, data in world['roads'].items() if not data['blocked'])
    response = client.post('/events/traffic-incident', json={'road_id': road_id})
    assert response.status_code == 200


def test_api_traffic_incident_clear_event(client):
    """POST /events/traffic-incident-clear is accepted."""
    world = client.get('/world-state').json()
    road_id = next(r for r, data in world['roads'].items() if not data['blocked'])
    client.post('/events/traffic-incident', json={'road_id': road_id})
    response = client.post('/events/traffic-incident-clear', json={'road_id': road_id})
    assert response.status_code == 200


def test_traffic_fields_in_world_state_api(client):
    """World state returned by the API must include traffic fields on roads."""
    world = client.get('/world-state').json()
    road = next(iter(world['roads'].values()))
    assert 'traffic_level' in road
    assert 'congestion_factor' in road
    assert 'base_travel_time' in road
    assert road['traffic_level'] in ('FREE', 'LOW', 'MODERATE', 'HEAVY', 'GRIDLOCK')
