import pytest
from backend.simulation.engine import Simulation
from backend.simulation.graph import Graph


def test_incident_creation_initial_state(sim):
    """Incident creation registers incident with NEW status when unreplaned, and sets required tasks."""
    inc = sim.incident({
        'id': 'TEST-NEW',
        'type': 'MEDICAL',
        'location': 'N12',
        'severity': 3,
        'affected_population': 20,
        'patients': 1,
        'critical_patients': 0,
    }, replan=False)

    assert inc.id in sim.world.incidents
    assert inc.status == 'NEW'
    assert inc.created_at == sim.world.time
    assert inc.total_tasks >= 1
    assert any(e.type == 'new_emergency' for e in sim.world.events)


def test_transition_to_responding_and_in_progress(sim):
    """Incident transitions to RESPONDING on dispatch, then IN_PROGRESS on scene arrival."""
    sim.world.running = True
    inc = sim.incident({
        'id': 'TEST-FIRE',
        'type': 'FIRE',
        'location': 'N01',
        'severity': 4,
        'affected_population': 50,
        'patients': 0,
        'critical_patients': 0,
    })

    # Initially dispatched
    assert inc.status == 'RESPONDING'
    assert any(e.type == 'incident_responding' and e.payload.get('incident_id') == 'TEST-FIRE' for e in sim.world.events)

    # Step forward until vehicle reaches scene
    max_steps = 30
    steps = 0
    while steps < max_steps and inc.status == 'RESPONDING':
        sim.tick(0.5)
        steps += 1

    # Should have transitioned to IN_PROGRESS upon arriving on scene
    assert inc.status in ('IN_PROGRESS', 'RESOLVED')
    assert any(e.type == 'incident_in_progress' and e.payload.get('incident_id') == 'TEST-FIRE' for e in sim.world.events)


def test_successful_automatic_resolution(sim):
    """Incident resolves automatically when all tasks complete, recording duration and reason."""
    sim.world.running = True
    # Fire at N01 with 0 patients: requires FIRE_TRUCK (and RESCUE_TEAM if severity/population)
    inc = sim.incident({
        'id': 'TEST-FIRE-RESOLVE',
        'type': 'FIRE',
        'location': 'N01',
        'severity': 3,
        'affected_population': 10,
        'patients': 0,
    })

    assert inc.status == 'RESPONDING'

    # Run simulation until resolution
    resolved = False
    for _ in range(80):
        sim.tick(0.5)
        if inc.status == 'RESOLVED':
            resolved = True
            break

    assert resolved, f'Incident failed to resolve; current status: {inc.status}, tasks: {inc.completed_tasks}/{inc.total_tasks}'
    assert inc.status == 'RESOLVED'
    assert inc.resolved_at is not None
    assert inc.resolved_at >= inc.created_at
    assert inc.duration is not None
    assert inc.duration == round(inc.resolved_at - inc.created_at, 2)
    assert inc.resolution_reason != ''

    # Verify resolution event and decision log
    resolve_events = [e for e in sim.world.events if e.type == 'incident_resolved' and e.payload.get('incident_id') == 'TEST-FIRE-RESOLVE']
    assert len(resolve_events) == 1
    assert resolve_events[0].payload['duration'] == inc.duration

    resolve_decisions = [d for d in sim.world.decisions if d.stage == 'RESOLVED' and 'TEST-FIRE-RESOLVE' in d.entities]
    assert len(resolve_decisions) >= 1


def test_no_premature_resolution_with_active_assignments(sim):
    """Incident must not be marked RESOLVED while vehicles are still active on scene or en route."""
    sim.world.running = True
    inc = sim.incident({
        'id': 'MULTI-TASK',
        'type': 'INDUSTRIAL',
        'location': 'N22',
        'severity': 4,
        'affected_population': 80,
        'patients': 1,
        'critical_patients': 1,
    })

    # Step simulation just a few times (vehicles are en route or early on scene)
    for _ in range(6):
        sim.tick(0.5)
        assert inc.status in ('RESPONDING', 'IN_PROGRESS')
        assert inc.status != 'RESOLVED'
        assert inc.resolved_at is None


def test_patients_waiting_or_in_transit_prevent_resolution(sim):
    """Incident must not resolve while a patient is still waiting or in transit."""
    sim.world.running = True
    inc = sim.incident({
        'id': 'PATIENT-TEST',
        'type': 'MEDICAL',
        'location': 'N12',
        'severity': 3,
        'affected_population': 10,
        'patients': 1,
        'critical_patients': 0,
    })

    patient = next(p for p in sim.world.patients.values() if p.incident_id == 'PATIENT-TEST')

    # Step until vehicle is transporting
    in_transit_seen = False
    for _ in range(50):
        sim.tick(0.5)
        if patient.status in ('WAITING', 'ASSIGNED', 'IN_TRANSIT'):
            assert inc.status != 'RESOLVED'
        if patient.status == 'IN_TRANSIT':
            in_transit_seen = True
            assert inc.status == 'IN_PROGRESS'
        if inc.status == 'RESOLVED':
            break

    assert in_transit_seen
    assert patient.status == 'ADMITTED'
    assert inc.status == 'RESOLVED'


def test_unassigned_task_results_in_unresolved_status(sim):
    """If required resources cannot be allocated, the incident transitions to UNRESOLVED."""
    # Fail all fire trucks
    sim.world.resources['FIRE-01'].available = False
    sim.world.resources['FIRE-02'].available = False

    inc = sim.incident({
        'id': 'UNRESOLVABLE',
        'type': 'FIRE',
        'location': 'N11',
        'severity': 3,
        'affected_population': 10,
        'patients': 0,
    })

    assert inc.status == 'UNRESOLVED'
    assert any(e.type == 'incident_unresolved' and e.payload.get('incident_id') == 'UNRESOLVABLE' for e in sim.world.events)

    # Now restore a fire truck: planning should resume and incident transitions to RESPONDING
    sim.change('vehicle-restore', {'resource_id': 'FIRE-01'})
    assert inc.status == 'RESPONDING'


def test_no_duplicate_resolution_events(sim):
    """Further ticks after an incident is resolved do not re-emit resolution events."""
    sim.world.running = True
    inc = sim.incident({
        'id': 'DUP-TEST',
        'type': 'FIRE',
        'location': 'N01',
        'severity': 3,
        'affected_population': 10,
        'patients': 0,
    })

    # Run until resolved
    for _ in range(80):
        sim.tick(0.5)
        if inc.status == 'RESOLVED':
            break

    assert inc.status == 'RESOLVED'
    initial_resolve_count = len([
        e for e in sim.world.events
        if e.type == 'incident_resolved' and e.payload.get('incident_id') == 'DUP-TEST'
    ])
    assert initial_resolve_count == 1

    # Run 20 more ticks
    for _ in range(20):
        sim.tick(0.5)

    post_resolve_count = len([
        e for e in sim.world.events
        if e.type == 'incident_resolved' and e.payload.get('incident_id') == 'DUP-TEST'
    ])
    assert post_resolve_count == 1, 'Duplicate resolution event detected!'


def test_multiple_incidents_resolve_independently(sim):
    """Multiple concurrent emergencies track progress and resolve independently."""
    sim.world.running = True

    # Close incident: N01 (quick response)
    inc_quick = sim.incident({
        'id': 'INC-QUICK',
        'type': 'FIRE',
        'location': 'N01',
        'severity': 3,
        'affected_population': 10,
        'patients': 0,
    })

    # Farther incident: N44 (longer travel time + patient transport)
    inc_longer = sim.incident({
        'id': 'INC-LONGER',
        'type': 'MEDICAL',
        'location': 'N44',
        'severity': 3,
        'affected_population': 10,
        'patients': 1,
    })

    # Run simulation: INC-QUICK should resolve before INC-LONGER
    quick_resolved_at = None
    longer_resolved_at = None

    for _ in range(120):
        sim.tick(0.5)
        if inc_quick.status == 'RESOLVED' and quick_resolved_at is None:
            quick_resolved_at = sim.world.time
            # At this moment, longer incident should still be active
            assert inc_longer.status in ('RESPONDING', 'IN_PROGRESS')
        if inc_longer.status == 'RESOLVED' and longer_resolved_at is None:
            longer_resolved_at = sim.world.time
        if quick_resolved_at and longer_resolved_at:
            break

    assert quick_resolved_at is not None
    assert longer_resolved_at is not None
    assert quick_resolved_at < longer_resolved_at
    assert inc_quick.status == 'RESOLVED'
    assert inc_longer.status == 'RESOLVED'


def test_resolved_incidents_remain_in_history(sim):
    """Resolved incidents are preserved in world.incidents for audit and inspection."""
    sim.world.running = True
    inc = sim.incident({
        'id': 'HIST-01',
        'type': 'FIRE',
        'location': 'N01',
        'severity': 3,
        'affected_population': 10,
        'patients': 0,
    })

    for _ in range(80):
        sim.tick(0.5)
        if inc.status == 'RESOLVED':
            break

    assert 'HIST-01' in sim.world.incidents
    stored = sim.world.incidents['HIST-01']
    assert stored.status == 'RESOLVED'
    assert stored.duration is not None
    assert stored.resolved_at is not None
    assert stored.total_tasks >= 1
    assert len(stored.completed_tasks) >= 1

