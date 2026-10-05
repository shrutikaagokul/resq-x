from backend.ai.logic.inference import reason
from backend.ai.csp.allocator import allocate, make_domains, tasks_for
from backend.ai.search.algorithms import astar
from backend.simulation.graph import Graph
from backend.simulation.models import Assignment
from .decision_explanation import record
from .local_search import improve
from .plan_validator import as_option, validate


def release(world, assignment):
    resource = world.resources[assignment.resource_id]
    resource.assigned_incident = None
    resource.status = 'IDLE' if resource.available else 'FAILED'
    if assignment.patient_id:
        patient = world.patients[assignment.patient_id]
        patient.status = 'WAITING'
        patient.hospital_id = None


def plan(world, trigger='Manual planning'):
    record(world, 'REASONING', 'Forward chaining', f'Observe and reason: {trigger}')
    kb, graph = reason(world), Graph(world)
    tasks = tasks_for(world, kb)
    by_task = {t.id: t for t in tasks}
    keep, invalid = [], []
    for assignment in sorted(world.plan.assignments, key=lambda a: (-by_task.get(a.task_id, a).priority, a.id)):
        if assignment.task_id in by_task:
            assignment.priority = by_task[assignment.task_id].priority
        reasons = validate(assignment, world, graph, [as_option(a, world) for a in keep])
        if reasons:
            invalid.append((assignment, reasons))
        else:
            keep.append(assignment)
    # Release a lower-priority reservation only if that makes the new task feasible.
    # This handles competition for hospital beds as well as vehicles.
    pending = [t for t in tasks if t.id not in {a.task_id for a in keep}]
    for task in sorted(pending, key=lambda t: -t.priority):
        domains, _ = make_domains(world, graph, [task], [as_option(a, world) for a in keep])
        if not any(v is not None for v in domains[task.id]):
            candidates = [a for a in keep if a.phase == 'RESPONDING' and a.priority < task.priority
                          and world.resources[a.resource_id].type == task.kind]
            for victim in sorted(candidates, key=lambda a: (a.priority, a.id)):
                alternative, _ = make_domains(world, graph, [task], [as_option(a, world) for a in keep if a is not victim])
                if any(v is not None for v in alternative[task.id]):
                    keep.remove(victim)
                    invalid.append((victim, [f'Higher-priority task {task.id} requires this resource/capacity reservation']))
                    break
    for assignment, reasons in invalid:
        record(world, 'REPLANNING', 'PlanValidator', f'{assignment.resource_id}: plan invalidated',
               [assignment.id, assignment.resource_id], reasons=reasons, previous=assignment.model_dump())
        # For an onboard patient, preserve custody if the resource still works.
        # Repair its hospital/route directly with the same feasibility checks.
        repaired = None
        if assignment.phase == 'TRANSPORTING' and world.resources[assignment.resource_id].available:
            resource = world.resources[assignment.resource_id]
            options = []
            for hospital in world.hospitals.values():
                route = astar(graph, resource.location, hospital.location)
                candidate = assignment.model_copy(deep=True)
                candidate.hospital_id = hospital.id
                candidate.route = route
                candidate.transport_route = route.model_copy(deep=True)
                candidate.edge_progress = 0
                if not validate(candidate, world, graph, [as_option(a, world) for a in keep]):
                    options.append(candidate)
            if options:
                repaired = min(options, key=lambda a: a.route.cost)
                keep.append(repaired)
                world.patients[repaired.patient_id].hospital_id = repaired.hospital_id
                record(world, 'ROUTING', 'A* + constraints', f'{resource.id}: transport repaired to {repaired.hospital_id}',
                       [resource.id], route=repaired.route.model_dump(), reasons=reasons)
        if repaired is None:
            release(world, assignment)
    reserved = [as_option(a, world) for a in keep]
    remaining = [t for t in tasks if t.id not in {a.task_id for a in keep}]
    record(world, 'ALLOCATING', 'CSP backtracking + forward checking',
           f'Allocate {len(remaining)} tasks; preserve {len(keep)} valid assignments',
           preserved=[a.id for a in keep])
    choices, domains, rejected, stats, compatible = allocate(world, graph, remaining, reserved)
    choices, optimization = improve(choices, domains, compatible)
    world.plan.revision += 1
    world.plan.unassigned = {}
    for task in remaining:
        option = choices[task.id]
        if option is None:
            reasons = list(rejected[task.id])
            if any(v is not None for v in domains[task.id]):
                competing = [f'{key} → {value.resource_id}' + (f' → {value.hospital_id}' if value.hospital_id else '')
                             for key, value in choices.items() if value is not None]
                reasons.insert(0, 'Joint resource/bed constraints defer this task; selected competing tasks: ' + ', '.join(competing))
            if stats['budget_exhausted']:
                reasons.append('Search node budget reached; best known feasible allocation retained')
            if not reasons:
                reasons = ['No compatible feasible resource/hospital option exists']
            world.plan.unassigned[task.id] = '; '.join(reasons)
            record(world, 'ALLOCATING', 'CSP', f'{task.id}: no feasible assignment', [task.incident_id],
                   reasons=reasons, feasible_domain_size=len(domains[task.id])-1)
            continue
        assignment = Assignment(id=f'A{world.plan.revision}-{task.id}', task_id=task.id,
            incident_id=task.incident_id, resource_id=option.resource_id, patient_id=task.patient_id,
            hospital_id=option.hospital_id, route=option.response.model_copy(deep=True),
            response_route=option.response, transport_route=option.transport,
            created_at=world.time, deadline=task.deadline, priority=task.priority)
        keep.append(assignment)
        resource = world.resources[option.resource_id]
        resource.status, resource.assigned_incident = 'RESPONDING', task.incident_id
        if task.patient_id:
            world.patients[task.patient_id].status = 'ASSIGNED'
            world.patients[task.patient_id].hospital_id = option.hospital_id
        record(world, 'ROUTING', 'CSP + A*', f'{resource.id} → {task.incident_id}' + (f' → {option.hospital_id}' if option.hospital_id else ''),
            [resource.id, task.incident_id], assignment=assignment.model_dump(),
            rules=[f for f in kb.trace if f['subject'] in (task.incident_id, task.patient_id)],
            rejected_alternatives=rejected[task.id], domain_size=len(domains[task.id])-1,
            constraints=['availability', 'compatibility', 'all-different resource', 'reachable routes',
                         'cumulative beds/ICU', 'capability', 'deadline', 'lexicographic incident priority'],
            hospital=world.hospitals[option.hospital_id].model_dump() if option.hospital_id else None)
    world.plan.assignments = keep
    world.plan.stats = {**stats, 'local_search': optimization, 'preserved': len(keep)-sum(v is not None for v in choices.values()),
                        'invalidated': len(invalid)}
    for incident in world.incidents.values():
        incident.assigned_resources = [a.resource_id for a in keep if a.incident_id == incident.id]
        if incident.status != 'RESOLVED':
            incident.status = 'RESPONDING' if incident.assigned_resources else 'WAITING'
    record(world, 'PLAN READY', 'Planner', f'Plan {world.plan.revision}: {len(keep)} active, {len(world.plan.unassigned)} waiting',
           stats=world.plan.stats)
    world.version += 1
    return world.plan
