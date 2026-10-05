from backend.ai.search.algorithms import astar
from .constraints import Option, Task, consistent
from .backtracking import solve


def tasks_for(world, kb):
    tasks = []
    for incident in world.incidents.values():
        if incident.status == 'RESOLVED':
            continue
        kinds = []
        if kb.has('fire_response_required', incident.id):
            kinds.append('FIRE_TRUCK')
        if kb.has('rescue_required', incident.id):
            kinds.append('RESCUE_TEAM')
        incident.required_resources = kinds + (['AMBULANCE'] if any(
            p.incident_id == incident.id for p in world.patients.values()) else [])
        for kind in kinds:
            key = f'{incident.id}:{kind}'
            if key not in incident.completed_tasks:
                tasks.append(Task(key, incident.id, kind, incident.priority,
                                  incident.created_at + 180))
        for patient in world.patients.values():
            if patient.incident_id == incident.id and patient.status != 'ADMITTED':
                tasks.append(Task(patient.id, incident.id, 'AMBULANCE',
                    max(incident.priority, 5 if patient.critical else 1),
                    incident.created_at + (120 if patient.critical else 220), patient.id))
    return tasks


def make_domains(world, graph, tasks, reserved):
    domains, rejected = {}, {}
    cache = {}
    def route(a, b):
        if (a, b) not in cache:
            cache[a, b] = astar(graph, a, b)
        return cache[a, b]
    reserved_resources = {o.resource_id for o in reserved}
    for task in tasks:
        values, reasons = [], set()
        incident = world.incidents[task.incident_id]
        patient = world.patients.get(task.patient_id)
        critical = bool(patient and patient.critical)
        for resource in world.resources.values():
            if resource.type != task.kind:
                continue
            if not resource.available or resource.id in reserved_resources:
                reasons.add(f'{resource.id}: unavailable or reserved by a valid plan')
                continue
            if critical and 'critical' not in resource.capabilities:
                reasons.add(f'{resource.id}: no critical transport capability')
                continue
            pickup = patient.location if patient and patient.location else incident.location
            response = route(resource.location, pickup)
            if not response.reachable:
                reasons.add(f'{resource.id}: incident unreachable')
                continue
            for hospital in world.hospitals.values() if patient else [None]:
                transport = None
                if hospital:
                    if not hospital.available or 'emergency' not in hospital.capabilities:
                        reasons.add(f'{hospital.id}: emergency service unavailable')
                        continue
                    if critical and ('critical' not in hospital.capabilities or hospital.icu_beds <= hospital.occupied_icu):
                        reasons.add(f'{hospital.id}: no suitable ICU capacity')
                        continue
                    transport = route(pickup, hospital.location)
                    if not transport.reachable:
                        reasons.add(f'{hospital.id}: destination unreachable')
                        continue
                duration = response.travel_time + 6 + (transport.travel_time if transport else 0)
                if world.time + duration > task.deadline:
                    reasons.add(f'{resource.id}: deadline {task.deadline}s cannot be met')
                    continue
                option = Option(resource.id, hospital.id if hospital else None, response, transport, critical)
                if consistent(reserved + [option], world):
                    values.append(option)
                else:
                    reasons.add(f'{hospital.id}: remaining beds/ICU reserved or occupied')
        domains[task.id] = sorted(values, key=lambda o: (o.cost, o.resource_id, o.hospital_id or '')) + [None]
        rejected[task.id] = sorted(reasons)
    return domains, rejected


def allocate(world, graph, tasks, reserved):
    domains, rejected = make_domains(world, graph, tasks, reserved)
    compatible = lambda choices: consistent(reserved + choices, world)
    assignment, stats = solve(tasks, domains, compatible)
    return assignment, domains, rejected, stats, compatible
