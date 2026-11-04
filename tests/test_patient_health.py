"""Unit and integration tests for patient health deterioration simulation."""
import json
import pytest
from backend.simulation.models import Patient, WorldState
from backend.simulation.patient_health import (
    INITIAL_HEALTH_SCORE,
    SERIOUS_THRESHOLD,
    CRITICAL_THRESHOLD,
    DEFAULT_DETERIORATION_RATE,
    determine_condition,
    init_patient_health,
    update_patient_waiting_time,
    apply_health_deterioration,
    update_critical_flag,
    step_patient_health,
    is_eligible_for_deterioration,
)
from backend.simulation.city import seed_world
from backend.database.database import Database
from backend.simulation.engine import Simulation
from backend.simulation.graph import Graph
from backend.ai.planning.plan_validator import validate, as_option


def assert_valid(world):
    reserved = []
    for a in world.plan.assignments:
        assert validate(a, world, Graph(world), reserved) == []
        reserved.append(as_option(a, world))
    assert len({a.resource_id for a in world.plan.assignments}) == len(world.plan.assignments)
    for h in world.hospitals.values():
        assert h.occupied_beds <= h.total_beds and h.occupied_icu <= h.icu_beds


# 1. Newly created non-critical patients start with a valid health profile
def test_newly_created_non_critical_patient_profile(sim):
    inc = sim.incident({'type': 'MEDICAL', 'location': 'N22', 'severity': 3,
                        'affected_population': 5, 'patients': 1, 'critical_patients': 0})
    patient = sim.world.patients[f'{inc.id}-P1']
    assert patient.health_score == INITIAL_HEALTH_SCORE == 100.0
    assert patient.condition == 'STABLE'
    assert patient.critical is False
    assert patient.waiting_time == 0.0
    assert patient.deterioration_rate == DEFAULT_DETERIORATION_RATE == 1.0


# 2. Initially critical patients receive the correct initial condition
def test_initially_critical_patient_condition(sim):
    inc = sim.incident({'type': 'MEDICAL', 'location': 'N22', 'severity': 5,
                        'affected_population': 5, 'patients': 1, 'critical_patients': 1})
    patient = sim.world.patients[f'{inc.id}-P1']
    assert patient.critical is True
    assert patient.condition == 'CRITICAL'
    assert patient.health_score <= CRITICAL_THRESHOLD


# 3. Health decreases deterministically during waiting
def test_health_decreases_deterministically_during_waiting(sim):
    inc = sim.incident({'type': 'MEDICAL', 'location': 'N22', 'severity': 2,
                        'affected_population': 5, 'patients': 1, 'critical_patients': 0})
    patient = sim.world.patients[f'{inc.id}-P1']
    sim.world.running = True

    # 10 ticks of 0.5s = 5.0 seconds
    for _ in range(10):
        sim.tick(0.5)

    assert patient.waiting_time == 5.0
    assert patient.health_score == round(100.0 - (1.0 * 5.0), 3) == 95.0


# 4. Stable patients transition to serious
def test_stable_patients_transition_to_serious():
    p = Patient(id='P1', incident_id='INC-1', critical=False)
    init_patient_health(p)
    assert p.condition == 'STABLE'

    # Step by 24 seconds (health 100 -> 76, still STABLE)
    transition = step_patient_health(p, 24.0)
    assert transition is None
    assert p.condition == 'STABLE'
    assert p.health_score == 76.0

    # Step by 1 second (health 76 -> 75, crosses SERIOUS_THRESHOLD)
    transition = step_patient_health(p, 1.0)
    assert transition is not None
    assert transition['previous_condition'] == 'STABLE'
    assert transition['new_condition'] == 'SERIOUS'
    assert transition['critical_changed'] is False
    assert p.condition == 'SERIOUS'
    assert p.critical is False
    assert p.health_score == 75.0


# 5. Serious patients transition to critical
def test_serious_patients_transition_to_critical():
    p = Patient(id='P1', incident_id='INC-1', critical=False, health_score=75.0, condition='SERIOUS')
    assert p.condition == 'SERIOUS'
    assert p.critical is False

    # Step by 24 seconds (health 75 -> 51, still SERIOUS)
    transition = step_patient_health(p, 24.0)
    assert transition is None
    assert p.condition == 'SERIOUS'
    assert p.critical is False

    # Step by 1 second (health 51 -> 50, reaches CRITICAL_THRESHOLD)
    transition = step_patient_health(p, 1.0)
    assert transition is not None
    assert transition['previous_condition'] == 'SERIOUS'
    assert transition['new_condition'] == 'CRITICAL'
    assert transition['critical_changed'] is True
    assert p.condition == 'CRITICAL'
    assert p.critical is True
    assert p.health_score == 50.0


# 6. Critical transitions update the existing critical Boolean
def test_critical_transitions_update_critical_boolean():
    p = Patient(id='P1', incident_id='INC-1', critical=False, health_score=51.0, condition='SERIOUS')
    assert p.critical is False

    transition = step_patient_health(p, 2.0)
    assert p.health_score == 49.0
    assert p.condition == 'CRITICAL'
    assert p.critical is True
    assert transition['critical_changed'] is True


# 7. Condition changes are recorded only once per transition
def test_condition_changes_recorded_only_once_per_transition(sim):
    for r in sim.world.resources.values():
        r.available = False
    sim.incident({'type': 'MEDICAL', 'location': 'N22', 'severity': 1,
                  'affected_population': 5, 'patients': 1, 'critical_patients': 0})
    sim.world.running = True

    # Advance until STABLE -> SERIOUS (25s = 50 ticks)
    for _ in range(50):
        sim.tick(0.5)

    events = [e for e in sim.world.events if e.type == 'patient_condition_change']
    assert len(events) == 1
    assert events[0].payload['previous_condition'] == 'STABLE'
    assert events[0].payload['new_condition'] == 'SERIOUS'

    # Advance another 10 ticks while remaining SERIOUS
    for _ in range(10):
        sim.tick(0.5)

    # Still only 1 event recorded
    events = [e for e in sim.world.events if e.type == 'patient_condition_change']
    assert len(events) == 1

    # Advance until SERIOUS -> CRITICAL (another 40 ticks = 20s, total 50s)
    for _ in range(40):
        sim.tick(0.5)

    events = [e for e in sim.world.events if e.type == 'patient_condition_change']
    assert len(events) == 2
    assert events[1].payload['previous_condition'] == 'SERIOUS'
    assert events[1].payload['new_condition'] == 'CRITICAL'

    # Advance another 10 ticks while remaining CRITICAL
    for _ in range(10):
        sim.tick(0.5)

    # Still only 2 events recorded
    events = [e for e in sim.world.events if e.type == 'patient_condition_change']
    assert len(events) == 2


# 8. IN_TRANSIT patients do not deteriorate
def test_in_transit_patients_do_not_deteriorate():
    p = Patient(id='P1', incident_id='INC-1', status='IN_TRANSIT', health_score=80.0, condition='SERIOUS')
    assert not is_eligible_for_deterioration(p)

    res = step_patient_health(p, 10.0)
    assert res is None
    assert p.health_score == 80.0
    assert p.waiting_time == 0.0


# 9. ADMITTED patients do not deteriorate
def test_admitted_patients_do_not_deteriorate():
    p = Patient(id='P1', incident_id='INC-1', status='ADMITTED', health_score=60.0, condition='SERIOUS')
    assert not is_eligible_for_deterioration(p)

    res = step_patient_health(p, 10.0)
    assert res is None
    assert p.health_score == 60.0
    assert p.waiting_time == 0.0


# 10. Existing saved simulation snapshots without the new fields still load
def test_backward_compatibility_old_snapshots_load(tmp_path):
    old_snapshot_data = {
        'nodes': {'N00': {'id': 'N00', 'x': 0.0, 'z': 0.0}},
        'roads': {},
        'buildings': [],
        'hospitals': {},
        'resources': {},
        'incidents': {},
        'patients': {
            'P_OLD_STABLE': {
                'id': 'P_OLD_STABLE',
                'incident_id': 'INC-1',
                'critical': False,
                'status': 'WAITING',
                'hospital_id': None,
                'location': None,
            },
            'P_OLD_CRITICAL': {
                'id': 'P_OLD_CRITICAL',
                'incident_id': 'INC-1',
                'critical': True,
                'status': 'WAITING',
                'hospital_id': None,
                'location': None,
            },
        },
        'plan': {'revision': 1, 'assignments': [], 'unassigned': {}, 'stats': {}},
        'time': 12.0,
        'running': False,
        'ai_status': 'OBSERVING',
        'events': [],
        'decisions': [],
        'facts': [],
        'demo_step': 0,
        'demo_active': False,
        'version': 1,
    }

    db_path = tmp_path / 'legacy.sqlite3'
    db = Database(db_path)
    # Insert raw old-format json directly into snapshot table
    db.connection.execute('INSERT OR REPLACE INTO snapshot VALUES (1, ?)', (json.dumps(old_snapshot_data),))
    db.connection.commit()

    loaded_world = db.load()
    assert loaded_world is not None
    p_stable = loaded_world.patients['P_OLD_STABLE']
    assert p_stable.health_score == 100.0
    assert p_stable.condition == 'STABLE'
    assert p_stable.critical is False

    p_critical = loaded_world.patients['P_OLD_CRITICAL']
    assert p_critical.condition == 'CRITICAL'
    assert p_critical.critical is True
    assert p_critical.health_score <= 50.0
    db.close()


# 11. A newly critical patient triggers the existing planning pipeline
def test_newly_critical_patient_triggers_planning(sim):
    # Disable AMB-02 so only AMB-01 is free
    sim.world.resources['AMB-02'].available = False
    inc = sim.incident({'type': 'MEDICAL', 'location': 'N22', 'severity': 1,
                        'affected_population': 5, 'patients': 1, 'critical_patients': 0})
    initial_revision = sim.world.plan.revision
    p = sim.world.patients[f'{inc.id}-P1']
    assert p.critical is False

    # Simulate patient health deteriorating to threshold
    p.health_score = 50.5
    sim.world.running = True
    sim.tick(1.0)  # decreases by 1.0 to 49.5 -> becomes CRITICAL

    assert p.condition == 'CRITICAL'
    assert p.critical is True
    # Planning pipeline was triggered
    assert sim.world.plan.revision > initial_revision
    assert any('Patient condition escalated to CRITICAL' in d.summary for d in sim.world.decisions)
    assert_valid(sim.world)


# 12. Existing resource, ICU and hospital capacity constraints remain enforced
def test_resource_icu_and_hospital_capacity_remain_enforced(sim):
    # Restrict H1 to 1 free ICU and H2 to 0 free ICU
    sim.world.hospitals['H2'].icu_beds = sim.world.hospitals['H2'].occupied_icu
    sim.world.hospitals['H1'].icu_beds = sim.world.hospitals['H1'].occupied_icu + 1

    # Create 2 non-critical patients
    inc = sim.incident({'type': 'MEDICAL', 'location': 'N22', 'severity': 1,
                        'affected_population': 10, 'patients': 2, 'critical_patients': 0})
    p1 = sim.world.patients[f'{inc.id}-P1']
    p2 = sim.world.patients[f'{inc.id}-P2']

    # Both patients deteriorate to critical
    p1.health_score = 50.5
    p2.health_score = 50.5
    sim.world.running = True
    sim.tick(1.0)

    assert p1.critical is True and p2.critical is True
    # Exactly 1 can receive an ICU reservation at H1; the second must be unassigned due to ICU scarcity
    assignments = [a for a in sim.world.plan.assignments if a.incident_id == inc.id]
    assert len(assignments) <= 1
    assert len(sim.world.plan.unassigned) >= 1
    assert_valid(sim.world)
