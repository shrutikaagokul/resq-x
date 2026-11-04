"""Incident lifecycle management and automatic resolution detection.

Manages state transitions: NEW -> RESPONDING -> IN_PROGRESS -> RESOLVED / UNRESOLVED / FAILED.
Ensures truthful completion detection accounting for tasks, active assignments, and patient outcomes.
"""
from backend.ai.planning.decision_explanation import record
from backend.simulation.models import Incident, WorldState


def determine_required_tasks(world: WorldState, incident: Incident) -> list[str]:
    """Determine the comprehensive list of required task identifiers for an incident."""
    tasks: list[str] = []

    # 1. Non-patient tasks (fire response, rescue / evacuation)
    needs_fire = incident.type in ('FIRE', 'INDUSTRIAL')
    needs_rescue = incident.type in ('FLOOD', 'EVACUATION', 'ACCIDENT', 'INDUSTRIAL') or (
        incident.severity >= 4 and incident.affected_population >= 30
    )

    if needs_fire:
        tasks.append(f'{incident.id}:FIRE_TRUCK')
    if needs_rescue:
        tasks.append(f'{incident.id}:RESCUE_TEAM')

    # 2. Patient tasks
    patients = [p for p in world.patients.values() if p.incident_id == incident.id]
    for p in patients:
        tasks.append(p.id)

    # 3. Fallback: if no tasks are required by rules (e.g., medical incident with 0 patients),
    # require at least an on-scene response assessment task.
    if not tasks:
        tasks.append(f'{incident.id}:ASSESSMENT')

    return tasks


def get_incident_task_status(world: WorldState, incident: Incident) -> tuple[list[str], list[str]]:
    """Return (required_tasks, completed_tasks) for the incident."""
    required = determine_required_tasks(world, incident)
    completed = set(incident.completed_tasks)

    # Any admitted patient is also considered completed
    for p in world.patients.values():
        if p.incident_id == incident.id and p.status == 'ADMITTED':
            completed.add(p.id)

    completed_list = [t for t in required if t in completed]
    return required, completed_list


def update_incident_lifecycles(world: WorldState, event_callback=None) -> list[dict]:
    """Evaluate and update lifecycle states for all incidents in the world.

    Emits transition events and decision log records when states change.
    Returns a list of transition summaries.
    """
    transitions = []

    for incident in list(world.incidents.values()):
        # Once an incident is marked RESOLVED, its lifecycle is complete.
        if incident.status == 'RESOLVED':
            if incident.resolved_at is None:
                incident.resolved_at = world.time
            if incident.duration is None:
                incident.duration = round(max(0.0, incident.resolved_at - incident.created_at), 2)
            continue

        required_tasks, completed_tasks = get_incident_task_status(world, incident)
        incident.total_tasks = len(required_tasks)

        # Sync completed_tasks on incident
        for t in completed_tasks:
            if t not in incident.completed_tasks:
                incident.completed_tasks.append(t)

        incident_patients = [p for p in world.patients.values() if p.incident_id == incident.id]
        active_assignments = [a for a in world.plan.assignments if a.incident_id == incident.id]

        all_tasks_completed = (len(required_tasks) > 0 and len(completed_tasks) >= len(required_tasks))
        all_patients_admitted = all(p.status == 'ADMITTED' for p in incident_patients)
        patients_waiting_or_transit = any(
            p.status in ('WAITING', 'ASSIGNED', 'IN_TRANSIT') for p in incident_patients
        )

        # Check for unassigned tasks specific to this incident
        unassigned_reasons = []
        for tid, reason in world.plan.unassigned.items():
            if tid.startswith(f'{incident.id}:') or tid in [p.id for p in incident_patients]:
                unassigned_reasons.append(reason)

        old_status = incident.status
        new_status = old_status
        transition_reason = ''

        # ── 1. Resolution Check ─────────────────────────────────────────────────
        if (
            all_tasks_completed
            and len(active_assignments) == 0
            and not patients_waiting_or_transit
            and len(unassigned_reasons) == 0
        ):
            new_status = 'RESOLVED'
            incident.resolved_at = world.time
            incident.duration = round(max(0.0, world.time - incident.created_at), 2)
            transition_reason = (
                f'All {len(required_tasks)} response tasks completed and '
                f'{len(incident_patients)} patients admitted'
            )
            incident.resolution_reason = transition_reason

        # ── 2. In Progress Check ────────────────────────────────────────────────
        elif len(active_assignments) > 0 and (
            any(a.phase in ('ON_SCENE', 'TRANSPORTING') for a in active_assignments)
            or len(completed_tasks) > 0
            or any(p.status == 'IN_TRANSIT' for p in incident_patients)
        ):
            new_status = 'IN_PROGRESS'
            transition_reason = 'Response operations active on-scene / patient transport underway'

        # ── 3. Responding Check ─────────────────────────────────────────────────
        elif len(active_assignments) > 0:
            new_status = 'RESPONDING'
            transition_reason = f'Resources dispatched and en route: {[a.resource_id for a in active_assignments]}'

        # ── 4. Unresolved / Failed Check ────────────────────────────────────────
        elif unassigned_reasons and len(active_assignments) == 0:
            # Check if deadline expired
            deadline_passed = False
            for a in active_assignments:
                if world.time > a.deadline:
                    deadline_passed = True
            new_status = 'FAILED' if deadline_passed else 'UNRESOLVED'
            transition_reason = '; '.join(unassigned_reasons)
            incident.resolution_reason = transition_reason

        # ── 5. New / Waiting Check ──────────────────────────────────────────────
        elif incident.created_at == world.time and len(completed_tasks) == 0 and len(active_assignments) == 0:
            new_status = 'NEW'
            transition_reason = 'Emergency reported; awaiting initial dispatch'
        else:
            new_status = 'WAITING'
            transition_reason = 'Awaiting available resources / capacity'

        # Apply transition if status changed or not yet notified
        if new_status != incident.last_notified_status:
            prev_status = incident.last_notified_status or old_status
            incident.status = new_status
            incident.last_notified_status = new_status
            payload = {
                'incident_id': incident.id,
                'type': incident.type,
                'previous_status': prev_status,
                'new_status': new_status,
                'reason': transition_reason,
                'completed_tasks': len(completed_tasks),
                'total_tasks': len(required_tasks),
            }

            if new_status == 'RESOLVED':
                payload.update({
                    'duration': incident.duration,
                    'created_at': incident.created_at,
                    'resolved_at': incident.resolved_at,
                    'patients_admitted': len(incident_patients),
                })
                if event_callback:
                    event_callback('incident_resolved', payload)
                record(
                    world, 'RESOLVED', 'IncidentLifecycle',
                    f'Incident {incident.id} ({incident.type}) resolved in {incident.duration}s: {transition_reason}',
                    [incident.id],
                    duration=incident.duration,
                    resolved_at=incident.resolved_at,
                    completed_tasks=len(completed_tasks),
                )
            elif new_status in ('UNRESOLVED', 'FAILED'):
                if event_callback:
                    event_callback(
                        'incident_failed' if new_status == 'FAILED' else 'incident_unresolved',
                        payload,
                    )
                record(
                    world, new_status, 'IncidentLifecycle',
                    f'Incident {incident.id} ({incident.type}) {new_status.lower()}: {transition_reason}',
                    [incident.id],
                    reason=transition_reason,
                )
            elif new_status == 'IN_PROGRESS':
                if event_callback:
                    event_callback('incident_in_progress', payload)
                record(
                    world, 'IN_PROGRESS', 'IncidentLifecycle',
                    f'Incident {incident.id} ({incident.type}) in progress: {transition_reason}',
                    [incident.id],
                )
            elif new_status == 'RESPONDING':
                if event_callback:
                    event_callback('incident_responding', payload)
                record(
                    world, 'RESPONDING', 'IncidentLifecycle',
                    f'Incident {incident.id} ({incident.type}) responding: {transition_reason}',
                    [incident.id],
                )
            else:
                if event_callback:
                    event_callback('incident_status_change', payload)

            transitions.append(payload)

    return transitions
