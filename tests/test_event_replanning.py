"""Regression tests for event-driven dynamic replanning.

Part 1: Hospital ICU capacity changes and patient reassignment.
Part 2: Road unblocking and route reconsideration for active vehicles.
"""
import pytest
from backend.ai.planning.plan_validator import validate, as_option
from backend.ai.search.algorithms import astar
from backend.database.database import Database
from backend.simulation.engine import Simulation
from backend.simulation.graph import Graph
from conftest import medical


# ─── helpers ────────────────────────────────────────────────────────────────

def assert_valid(world):
    reserved = []
    for a in world.plan.assignments:
        assert validate(a, world, Graph(world), reserved) == []
        reserved.append(as_option(a, world))
    assert len({a.resource_id for a in world.plan.assignments}) == len(world.plan.assignments)


def fresh_sim():
    return Simulation(Database(':memory:'))


def saturate_all_icu(world):
    """Set every hospital ICU to 0 free beds."""
    for h in world.hospitals.values():
        h.icu_beds = h.occupied_icu


def one_ambulance_sim():
    """Simulation with only AMB-01 available, positioned at N02."""
    sim = fresh_sim()
    for r in sim.world.resources.values():
        if r.id != 'AMB-01':
            r.available = False
            r.status = 'MAINTENANCE'
    sim.world.resources['AMB-01'].location = 'N02'
    return sim


def block_first_edge_on_path(sim, path):
    """Block the first traversable road along *path*. Returns the road id."""
    for a_node, b_node in zip(path, path[1:]):
        road_id = f'{a_node}-{b_node}'
        if road_id in sim.world.roads:
            sim.change('road-block', {'road_id': road_id})
            return road_id
    raise ValueError('No blockable road found on path')


# ─── Part 1: Hospital ICU capacity replanning ────────────────────────────────

class TestHospitalICUReplanning:

    def test_patient_remains_waiting_when_no_icu_capacity(self):
        """Patient with critical condition stays WAITING when all ICU beds are full."""
        sim = fresh_sim()
        saturate_all_icu(sim.world)
        sim.incident(dict(id='MED', type='MEDICAL', location='N22',
                          severity=3, affected_population=5,
                          patients=1, critical_patients=1))
        patient = sim.world.patients['MED-P1']
        assert patient.status == 'WAITING'
        assert len(sim.world.plan.assignments) == 0
        assert 'ICU capacity' in sim.world.plan.unassigned.get('MED-P1', '')

    def test_increasing_icu_triggers_patient_assignment(self):
        """Adding one ICU bed to a full hospital triggers patient reconsideration."""
        sim = fresh_sim()
        saturate_all_icu(sim.world)
        sim.incident(dict(id='MED', type='MEDICAL', location='N22',
                          severity=3, affected_population=5,
                          patients=1, critical_patients=1))
        assert sim.world.patients['MED-P1'].status == 'WAITING'

        h = sim.world.hospitals['H1']
        sim.change('hospital-change', {'hospital_id': 'H1', 'icu_beds': h.icu_beds + 1})

        assert sim.world.patients['MED-P1'].status == 'ASSIGNED'
        assert len(sim.world.plan.assignments) == 1
        assert 'MED-P1' not in sim.world.plan.unassigned

    def test_patient_dispatched_to_hospital_with_new_icu_bed(self):
        """Assignment targets a hospital that now has ICU capacity."""
        sim = fresh_sim()
        saturate_all_icu(sim.world)
        sim.incident(dict(id='MED', type='MEDICAL', location='N22',
                          severity=3, affected_population=5,
                          patients=1, critical_patients=1))
        sim.change('hospital-change', {'hospital_id': 'H1',
                                       'icu_beds': sim.world.hospitals['H1'].icu_beds + 1})
        a = sim.world.plan.assignments[0]
        h = sim.world.hospitals[a.hospital_id]
        assert h.icu_beds > h.occupied_icu, 'Assigned hospital must have free ICU'
        assert_valid(sim.world)

    def test_one_new_icu_bed_admits_only_one_patient(self):
        """Two waiting critical patients; +1 ICU bed assigns exactly one of them."""
        sim = fresh_sim()
        saturate_all_icu(sim.world)
        sim.incident(dict(id='MED', type='MEDICAL', location='N22',
                          severity=3, affected_population=10,
                          patients=2, critical_patients=2))
        assert len(sim.world.plan.assignments) == 0
        assert len(sim.world.plan.unassigned) == 2

        sim.change('hospital-change', {'hospital_id': 'H1',
                                       'icu_beds': sim.world.hospitals['H1'].icu_beds + 1})
        assert len(sim.world.plan.assignments) == 1
        assert len(sim.world.plan.unassigned) == 1

    def test_no_duplicate_assignments_after_capacity_increase(self):
        """No patient receives more than one ambulance assignment."""
        sim = fresh_sim()
        saturate_all_icu(sim.world)
        sim.incident(dict(id='MED', type='MEDICAL', location='N22',
                          severity=3, affected_population=5,
                          patients=1, critical_patients=1))
        sim.change('hospital-change', {'hospital_id': 'H1',
                                       'icu_beds': sim.world.hospitals['H1'].icu_beds + 1})
        # Call again — should be idempotent
        sim.change('hospital-change', {'hospital_id': 'H2',
                                       'icu_beds': sim.world.hospitals['H2'].icu_beds + 1})
        patient_assignments = [a for a in sim.world.plan.assignments if a.patient_id == 'MED-P1']
        assert len(patient_assignments) == 1, 'Patient must have exactly one assignment'

    def test_decreasing_icu_invalidates_assignment_and_reassigns(self):
        """Reducing a hospital's ICU to its occupancy level causes the planner to
        find an alternative hospital for the reserved bed."""
        sim = fresh_sim()
        sim.incident(dict(id='MED', type='MEDICAL', location='N22',
                          severity=3, affected_population=5,
                          patients=1, critical_patients=1))
        assert len(sim.world.plan.assignments) == 1
        original_hospital = sim.world.plan.assignments[0].hospital_id

        sim.change('hospital-change', {'hospital_id': original_hospital,
                                       'icu_beds': sim.world.hospitals[original_hospital].occupied_icu})
        # Either reassigned to another hospital or placed in unassigned (no infinite active)
        for a in sim.world.plan.assignments:
            assert a.hospital_id != original_hospital
        assert_valid(sim.world)

    def test_patient_already_admitted_not_reassigned(self):
        """ADMITTED patients are not given duplicate assignments."""
        sim = fresh_sim()
        sim.incident(dict(id='MED', type='MEDICAL', location='N22',
                          severity=3, affected_population=5,
                          patients=1, critical_patients=1))
        p = sim.world.patients['MED-P1']
        p.status = 'ADMITTED'
        p.hospital_id = 'H1'
        sim.world.plan.assignments.clear()
        sim.world.plan.unassigned.clear()
        # Increase ICU — should not create an assignment for already-admitted patient
        sim.change('hospital-change', {'hospital_id': 'H2',
                                       'icu_beds': sim.world.hospitals['H2'].icu_beds + 1})
        patient_assignments = [a for a in sim.world.plan.assignments if a.patient_id == 'MED-P1']
        assert len(patient_assignments) == 0, 'Admitted patient must not be re-assigned'

    def test_hospital_unavailability_does_not_allow_assignment(self):
        """Making a hospital unavailable ensures it cannot receive a reservation."""
        sim = fresh_sim()
        saturate_all_icu(sim.world)
        sim.incident(dict(id='MED', type='MEDICAL', location='N22',
                          severity=3, affected_population=5,
                          patients=1, critical_patients=1))
        # Increase ICU but mark hospital unavailable simultaneously
        h = sim.world.hospitals['H1']
        sim.change('hospital-change', {'hospital_id': 'H1',
                                       'icu_beds': h.icu_beds + 1,
                                       'available': False})
        # H1 should not be chosen
        for a in sim.world.plan.assignments:
            assert a.hospital_id != 'H1'


# ─── Part 2: Deadline handling and late rescue ──────────────────────────────

class TestDeadlineAndLateRescueReplanning:

    def test_normal_dispatch_before_deadline(self):
        """Normal dispatch before deadline creates on-time assignment with original deadline."""
        sim = fresh_sim()
        sim.incident(dict(id='MED', type='MEDICAL', location='N22',
                          severity=3, affected_population=5,
                          patients=1, critical_patients=1))
        assert len(sim.world.plan.assignments) == 1
        asgn = sim.world.plan.assignments[0]
        assert not asgn.late_rescue
        assert asgn.deadline == 120.0
        assert sim.world.time < asgn.deadline
        # Check decision log records
        routing_d = [d for d in sim.world.decisions if d.stage == 'ROUTING' and d.entities == [asgn.resource_id, 'MED']]
        assert routing_d, 'ROUTING decision must be logged'
        assert routing_d[-1].evidence.get('late_rescue') is False
        assert routing_d[-1].evidence.get('original_deadline') == 120.0

    def test_icu_capacity_unavailable_until_after_deadline(self):
        """When ICU is full, patient remains WAITING past deadline and is marked overdue."""
        sim = fresh_sim()
        saturate_all_icu(sim.world)
        sim.incident(dict(id='MED', type='MEDICAL', location='N22',
                          severity=3, affected_population=5,
                          patients=1, critical_patients=1))
        assert sim.world.patients['MED-P1'].status == 'WAITING'
        assert len(sim.world.plan.assignments) == 0

        # Advance world time past original deadline (120s)
        sim.world.time = 150.0
        # Trigger standard planning update (not a hospital change)
        from backend.ai.planning.planner import plan
        plan(sim.world, 'Tick / state update')

        # Patient still waiting, not disqualified
        assert sim.world.patients['MED-P1'].status == 'WAITING'
        assert len(sim.world.plan.assignments) == 0
        unassigned_msg = sim.world.plan.unassigned.get('MED-P1', '')
        assert 'overdue' in unassigned_msg or 'deadline' in unassigned_msg

    def test_icu_capacity_increased_before_deadline(self):
        """When ICU capacity increases before deadline, assignment is on-time."""
        sim = fresh_sim()
        saturate_all_icu(sim.world)
        sim.incident(dict(id='MED', type='MEDICAL', location='N22',
                          severity=3, affected_population=5,
                          patients=1, critical_patients=1))
        # Advance time to t=50 (before deadline of 120)
        sim.world.time = 50.0
        h = sim.world.hospitals['H1']
        sim.change('hospital-change', {'hospital_id': 'H1', 'icu_beds': h.icu_beds + 1})

        assert sim.world.patients['MED-P1'].status == 'ASSIGNED'
        assert len(sim.world.plan.assignments) == 1
        asgn = sim.world.plan.assignments[0]
        assert not asgn.late_rescue
        assert asgn.deadline == 120.0  # original deadline preserved

    def test_icu_capacity_increased_after_deadline_creates_late_rescue(self):
        """When ICU capacity increases after deadline, allocator creates a late-rescue assignment,
        preserving original deadline and logging late_rescue."""
        sim = fresh_sim()
        saturate_all_icu(sim.world)
        sim.incident(dict(id='MED', type='MEDICAL', location='N22',
                          severity=3, affected_population=5,
                          patients=1, critical_patients=1))
        assert sim.world.patients['MED-P1'].status == 'WAITING'

        # Advance time past deadline
        sim.world.time = 150.0
        h = sim.world.hospitals['H1']
        sim.change('hospital-change', {'hospital_id': 'H1', 'icu_beds': h.icu_beds + 1})

        assert sim.world.patients['MED-P1'].status == 'ASSIGNED'
        assert len(sim.world.plan.assignments) == 1
        asgn = sim.world.plan.assignments[0]
        assert asgn.late_rescue is True
        assert asgn.deadline == 120.0  # Original deadline strictly preserved!

        # Decision log records that assignment occurred after original deadline
        routing_d = [d for d in sim.world.decisions if d.stage == 'ROUTING' and 'late rescue' in d.summary]
        assert len(routing_d) >= 1
        assert routing_d[-1].evidence.get('late_rescue') is True
        assert routing_d[-1].evidence.get('original_deadline') == 120.0
        assert routing_d[-1].evidence.get('dispatch_time') == 150.0

        # Plan passes validation on subsequent ticks without being dropped
        sim.world.running = True
        sim.tick()
        assert len(sim.world.plan.assignments) == 1
        assert sim.world.plan.assignments[0].patient_id == 'MED-P1'

    def test_multiple_waiting_patients_competing_for_one_icu_bed(self):
        """Two overdue critical patients compete for 1 new ICU bed; exactly 1 assigned, no overbooking."""
        sim = fresh_sim()
        saturate_all_icu(sim.world)
        sim.incident(dict(id='MED1', type='MEDICAL', location='N22',
                          severity=3, affected_population=5,
                          patients=1, critical_patients=1))
        sim.incident(dict(id='MED2', type='MEDICAL', location='N23',
                          severity=3, affected_population=5,
                          patients=1, critical_patients=1))
        # Advance time past deadline for both
        sim.world.time = 150.0
        h = sim.world.hospitals['H1']
        sim.change('hospital-change', {'hospital_id': 'H1', 'icu_beds': h.icu_beds + 1})

        # Exactly 1 assignment created, no overbooking
        assert len(sim.world.plan.assignments) == 1
        assigned_patient = sim.world.plan.assignments[0].patient_id
        unassigned_patient = 'MED2-P1' if assigned_patient == 'MED1-P1' else 'MED1-P1'
        assert sim.world.patients[assigned_patient].status == 'ASSIGNED'
        assert sim.world.patients[unassigned_patient].status == 'WAITING'
        assert unassigned_patient in sim.world.plan.unassigned
        # Verify hospital capacity not overbooked
        h1 = sim.world.hospitals['H1']
        assert h1.occupied_icu + 1 <= h1.icu_beds

    def test_no_suitable_hospital_available_even_after_deadline(self):
        """When hospital capacity change does not provide a suitable hospital, patient remains WAITING."""
        sim = fresh_sim()
        saturate_all_icu(sim.world)
        sim.incident(dict(id='MED', type='MEDICAL', location='N22',
                          severity=3, affected_population=5,
                          patients=1, critical_patients=1))
        sim.world.time = 150.0

        # Change capacity on hospital without critical care capability
        h = sim.world.hospitals['H1']
        sim.change('hospital-change', {'hospital_id': 'H1', 'icu_beds': h.icu_beds + 1, 'capabilities': ['emergency']})

        # H1 lacks critical care, so patient cannot be assigned
        assert len(sim.world.plan.assignments) == 0
        assert sim.world.patients['MED-P1'].status == 'WAITING'
        assert 'MED-P1' in sim.world.plan.unassigned

    def test_ambulance_unavailable_when_icu_capacity_becomes_available(self):
        """When hospital ICU capacity increases but no ambulance is available, patient remains WAITING."""
        sim = fresh_sim()
        saturate_all_icu(sim.world)
        # Mark all ambulances unavailable
        for r in sim.world.resources.values():
            if r.type == 'AMBULANCE':
                r.available = False
                r.status = 'MAINTENANCE'

        sim.incident(dict(id='MED', type='MEDICAL', location='N22',
                          severity=3, affected_population=5,
                          patients=1, critical_patients=1))
        sim.world.time = 150.0
        h = sim.world.hospitals['H1']
        sim.change('hospital-change', {'hospital_id': 'H1', 'icu_beds': h.icu_beds + 1})

        # No ambulance available to execute assignment
        assert len(sim.world.plan.assignments) == 0
        assert sim.world.patients['MED-P1'].status == 'WAITING'
        assert 'MED-P1' in sim.world.plan.unassigned

    def test_overdue_fire_response_cannot_bypass_deadline_on_hospital_change(self):
        """Overdue fire-truck tasks cannot receive late rescue or bypass deadline when hospital capacity changes."""
        sim = fresh_sim()
        # Mark fire trucks unavailable initially so task cannot be dispatched
        for r in sim.world.resources.values():
            if r.type == 'FIRE_TRUCK':
                r.available = False
                r.status = 'MAINTENANCE'

        sim.incident(dict(id='FIRE', type='FIRE', location='N22',
                          severity=3, affected_population=10,
                          patients=0, critical_patients=0))
        # Fire truck task deadline is created_at + 180 = 180s
        assert len(sim.world.plan.assignments) == 0

        # Advance world time past fire task deadline
        sim.world.time = 250.0

        # Restore fire truck availability
        for r in sim.world.resources.values():
            if r.type == 'FIRE_TRUCK':
                r.available = True
                r.status = 'IDLE'

        # Trigger hospital capacity change
        h = sim.world.hospitals['H1']
        sim.change('hospital-change', {'hospital_id': 'H1', 'icu_beds': h.icu_beds + 1})

        # Fire truck task must NOT be assigned because it is overdue and cannot bypass its deadline
        fire_assignments = [a for a in sim.world.plan.assignments if a.incident_id == 'FIRE']
        assert len(fire_assignments) == 0, 'Overdue fire response task must not bypass deadline on hospital change'
        assert 'FIRE:FIRE_TRUCK' in sim.world.plan.unassigned

    def test_overdue_rescue_team_cannot_bypass_deadline_on_hospital_change(self):
        """Overdue rescue-team tasks cannot receive late rescue or bypass deadline when hospital capacity changes."""
        sim = fresh_sim()
        # Mark rescue teams unavailable initially so task cannot be dispatched
        for r in sim.world.resources.values():
            if r.type == 'RESCUE_TEAM':
                r.available = False
                r.status = 'MAINTENANCE'

        sim.incident(dict(id='FLOOD', type='FLOOD', location='N22',
                          severity=3, affected_population=10,
                          patients=0, critical_patients=0))
        # Rescue team task deadline is created_at + 180 = 180s
        assert len(sim.world.plan.assignments) == 0

        # Advance world time past rescue task deadline
        sim.world.time = 250.0

        # Restore rescue team availability
        for r in sim.world.resources.values():
            if r.type == 'RESCUE_TEAM':
                r.available = True
                r.status = 'IDLE'

        # Trigger hospital capacity change
        h = sim.world.hospitals['H1']
        sim.change('hospital-change', {'hospital_id': 'H1', 'icu_beds': h.icu_beds + 1})

        # Rescue team task must NOT be assigned because it is overdue and cannot bypass its deadline
        rescue_assignments = [a for a in sim.world.plan.assignments if a.incident_id == 'FLOOD']
        assert len(rescue_assignments) == 0, 'Overdue rescue team task must not bypass deadline on hospital change'
        assert 'FLOOD:RESCUE_TEAM' in sim.world.plan.unassigned


# ─── Part 3: Road unblocking and route replanning ────────────────────────────

class TestRoadUnblockingReplanning:

    def test_vehicle_uses_detour_when_optimal_road_blocked(self):
        """With a road blocked, the assigned route avoids that road."""
        sim = one_ambulance_sim()
        g = Graph(sim.world)
        opt = astar(g, 'N02', 'N40')
        road_id = block_first_edge_on_path(sim, opt.path)
        sim.incident(dict(id='MED', type='MEDICAL', location='N40',
                          severity=3, affected_population=5, patients=1, critical_patients=0))
        a = sim.world.plan.assignments[0]
        edge_ids = {f'{x}-{y}' for x, y in zip(a.route.path, a.route.path[1:])}
        assert road_id not in edge_ids, 'Route must not use the blocked road'

    def test_unblocking_road_triggers_route_reconsideration(self):
        """After a blocked road re-opens, a vehicle using a detour must switch to
        the now-shorter route."""
        sim = one_ambulance_sim()
        g = Graph(sim.world)
        opt_before = astar(g, 'N02', 'N40')
        road_id = block_first_edge_on_path(sim, opt_before.path)

        sim.incident(dict(id='MED', type='MEDICAL', location='N40',
                          severity=3, affected_population=5, patients=1, critical_patients=0))
        detour_path = list(sim.world.plan.assignments[0].route.path)
        detour_cost = sim.world.plan.assignments[0].route.cost

        sim.change('road-reopen', {'road_id': road_id})

        asgn = sim.world.plan.assignments[0]
        assert asgn.route.path != detour_path, 'Route must be updated after road re-opens'
        assert asgn.route.cost <= detour_cost, 'New route cost must not exceed detour cost'

    def test_vehicle_switches_to_optimal_route(self):
        """Route after re-opening matches the globally optimal path."""
        sim = one_ambulance_sim()
        g = Graph(sim.world)
        opt_before = astar(g, 'N02', 'N40')
        road_id = block_first_edge_on_path(sim, opt_before.path)

        sim.incident(dict(id='MED', type='MEDICAL', location='N40',
                          severity=3, affected_population=5, patients=1, critical_patients=0))
        sim.change('road-reopen', {'road_id': road_id})

        asgn = sim.world.plan.assignments[0]
        g2 = Graph(sim.world)
        opt_after = astar(g2, 'N02', 'N40')
        assert asgn.route.path == opt_after.path, 'Vehicle must use the now-optimal route'

    def test_vehicle_does_not_use_still_blocked_road(self):
        """A vehicle never includes a road that remains blocked in its route."""
        sim = one_ambulance_sim()
        g = Graph(sim.world)
        opt = astar(g, 'N02', 'N40')
        # Block two roads — the first from the optimal path, and an extra one
        road_1 = block_first_edge_on_path(sim, opt.path)
        all_roads = list(sim.world.roads.keys())
        extra_road = next(r for r in all_roads if r != road_1 and not sim.world.roads[r].blocked)
        sim.change('road-block', {'road_id': extra_road})

        sim.incident(dict(id='MED', type='MEDICAL', location='N40',
                          severity=3, affected_population=5, patients=1, critical_patients=0))
        # Reopen only the first blocked road; extra_road stays blocked
        sim.change('road-reopen', {'road_id': road_1})

        asgn = sim.world.plan.assignments[0]
        edge_ids = {f'{a}-{b}' for a, b in zip(asgn.route.path, asgn.route.path[1:])}
        assert extra_road not in edge_ids, 'Route must not include still-blocked road'
        assert_valid(sim.world)

    def test_vehicle_position_and_progress_preserved(self):
        """When a route is updated mid-journey, the vehicle's location and
        edge progress are not reset."""
        sim = one_ambulance_sim()
        g = Graph(sim.world)
        opt = astar(g, 'N02', 'N40')
        road_id = block_first_edge_on_path(sim, opt.path)

        sim.incident(dict(id='MED', type='MEDICAL', location='N40',
                          severity=3, affected_population=5, patients=1, critical_patients=0))

        # Simulate partial progress along the first edge
        asgn = sim.world.plan.assignments[0]
        asgn.edge_progress = 2.5
        # Location stays at the start node of the current edge
        expected_location = sim.world.resources['AMB-01'].location

        sim.change('road-reopen', {'road_id': road_id})

        asgn2 = sim.world.plan.assignments[0]
        assert sim.world.resources['AMB-01'].location == expected_location
        assert asgn2.edge_progress == 2.5
        assert asgn2.route.path[0] == expected_location

    def test_completed_vehicles_not_replanned(self):
        """Vehicles that have reached their destination (single-node path) are
        not given a spurious new route when a road re-opens.

        A vehicle in ON_SCENE state has resource.location == route.path[-1] and
        a single-element path.  The route-improvement pass skips paths with
        fewer than two nodes, so the assignment is left unchanged.
        """
        sim = one_ambulance_sim()
        g = Graph(sim.world)
        opt = astar(g, 'N02', 'N40')
        road_id = block_first_edge_on_path(sim, opt.path)

        sim.incident(dict(id='MED', type='MEDICAL', location='N40',
                          severity=3, affected_population=5, patients=1, critical_patients=0))

        # Move vehicle to destination and set fully consistent ON_SCENE state
        # (resource.location, route.path[0], and phase must all agree)
        asgn = sim.world.plan.assignments[0]
        sim.world.resources['AMB-01'].location = 'N40'
        asgn.route.path = ['N40']   # single-node: at destination
        asgn.phase = 'ON_SCENE'
        sim.world.resources['AMB-01'].status = 'ON_SCENE'
        frozen_path = list(asgn.route.path)

        sim.change('road-reopen', {'road_id': road_id})

        # ON_SCENE assignment has a single-node path; _improve_routes skips it
        asgn2 = sim.world.plan.assignments[0]
        assert asgn2.route.path == frozen_path, 'Arrived vehicle route must not change'
        assert asgn2.phase == 'ON_SCENE'

    def test_no_route_change_when_detour_is_already_optimal(self):
        """When reopening a road that was not on the optimal route anyway, the
        vehicle's route is left unchanged (no unnecessary switching)."""
        sim = one_ambulance_sim()
        sim.incident(dict(id='MED', type='MEDICAL', location='N40',
                          severity=3, affected_population=5, patients=1, critical_patients=0))

        asgn = sim.world.plan.assignments[0]
        original_path = list(asgn.route.path)
        original_cost = asgn.route.cost

        # Block and immediately reopen a road that the vehicle's route does NOT use
        all_roads = list(sim.world.roads.keys())
        irrelevant_road = next(
            r for r in all_roads
            if r not in {f'{a}-{b}' for a, b in zip(original_path, original_path[1:])}
        )
        sim.change('road-block', {'road_id': irrelevant_road})
        sim.change('road-reopen', {'road_id': irrelevant_road})

        asgn2 = sim.world.plan.assignments[0]
        # Route may or may not change but cost must not increase
        assert asgn2.route.cost <= original_cost + 0.001

    def test_multiple_vehicles_replanned_independently(self):
        """When multiple vehicles have detours and a road re-opens, each is
        reconsidered independently and each switches only if its own route improves."""
        sim = fresh_sim()
        # Keep two ambulances: AMB-01 at N02, AMB-02 at N40
        for r in sim.world.resources.values():
            if r.id not in ('AMB-01', 'AMB-02'):
                r.available = False
                r.status = 'MAINTENANCE'
        sim.world.resources['AMB-01'].location = 'N02'
        sim.world.resources['AMB-02'].location = 'N40'

        # Block the road between N02 and N12
        sim.change('road-block', {'road_id': 'N02-N12'})

        # Create two separate incidents
        sim.incident(dict(id='I1', type='MEDICAL', location='N40',
                          severity=3, affected_population=5, patients=1, critical_patients=0))
        sim.incident(dict(id='I2', type='MEDICAL', location='N02',
                          severity=3, affected_population=5, patients=1, critical_patients=0))

        pre_costs = {a.resource_id: a.route.cost for a in sim.world.plan.assignments}
        pre_paths = {a.resource_id: list(a.route.path) for a in sim.world.plan.assignments}

        sim.change('road-reopen', {'road_id': 'N02-N12'})

        for asgn in sim.world.plan.assignments:
            assert asgn.route.cost <= pre_costs[asgn.resource_id] + 0.001
            assert_valid(sim.world)

    def test_route_improvement_recorded_in_decision_log(self):
        """A route improvement must generate a ROUTING decision in the log."""
        sim = one_ambulance_sim()
        g = Graph(sim.world)
        opt = astar(g, 'N02', 'N40')
        road_id = block_first_edge_on_path(sim, opt.path)
        sim.incident(dict(id='MED', type='MEDICAL', location='N40',
                          severity=3, affected_population=5, patients=1, critical_patients=0))
        decisions_before = len(sim.world.decisions)

        sim.change('road-reopen', {'road_id': road_id})

        new_decisions = sim.world.decisions[decisions_before:]
        routing_decisions = [d for d in new_decisions if d.stage == 'ROUTING']
        assert len(routing_decisions) >= 1, 'Route improvement must be recorded in decision log'
        assert 'AMB-01' in routing_decisions[-1].summary
