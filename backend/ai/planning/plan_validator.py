from backend.ai.csp.constraints import Option, consistent


def as_option(assignment, world):
    return Option(assignment.resource_id, assignment.hospital_id, assignment.response_route,
                  assignment.transport_route,
                  bool(assignment.patient_id and world.patients[assignment.patient_id].critical))


def validate(assignment, world, graph, reservations=()):
    reasons = []
    resource = world.resources[assignment.resource_id]
    incident = world.incidents[assignment.incident_id]
    kind = 'AMBULANCE' if assignment.patient_id else assignment.task_id.split(':')[-1]
    if not resource.available:
        reasons.append('Resource is unavailable')
    if resource.type != kind:
        reasons.append('Resource is incompatible with task')
    if assignment.patient_id and world.patients[assignment.patient_id].critical and 'critical' not in resource.capabilities:
        reasons.append('Resource lacks critical transport capability')
    routes = [assignment.route]
    if assignment.phase != 'TRANSPORTING' and assignment.transport_route:
        routes.append(assignment.transport_route)
    for route in routes:
        if not route.reachable or not route.path:
            reasons.append('Route does not exist')
        for a, b in zip(route.path, route.path[1:]):
            edge = graph.edge(a, b)
            if edge is None or edge.blocked:
                reasons.append(f'Route invalid: road {a} → {b} blocked or missing')
    if assignment.route.path and assignment.route.path[0] != resource.location:
        reasons.append('Route origin does not match resource location')
    expected = world.hospitals[assignment.hospital_id].location if assignment.phase == 'TRANSPORTING' else (
        world.patients[assignment.patient_id].location or incident.location if assignment.patient_id else incident.location)
    if assignment.route.path and assignment.route.path[-1] != expected:
        reasons.append('Route destination is inconsistent')
    if assignment.hospital_id:
        hospital = world.hospitals[assignment.hospital_id]
        patient = world.patients[assignment.patient_id]
        if not hospital.available or 'emergency' not in hospital.capabilities:
            reasons.append('Hospital is unavailable')
        if patient.critical and 'critical' not in hospital.capabilities:
            reasons.append('Hospital lacks critical care capability')
        if assignment.phase != 'TRANSPORTING':
            transport = assignment.transport_route
            pickup = patient.location or incident.location
            if (not transport or not transport.path or transport.path[0] != pickup
                    or transport.path[-1] != hospital.location):
                reasons.append('Patient transport route has inconsistent endpoints')
    if not consistent(list(reservations) + [as_option(assignment, world)], world):
        reasons.append('Resource uniqueness or hospital bed/ICU capacity constraint violated')
    remaining = 0
    for route in routes:
        remaining += sum(graph.edge(a, b).travel_time for a, b in zip(route.path, route.path[1:]) if graph.edge(a, b))
    remaining -= assignment.edge_progress
    if assignment.phase != 'TRANSPORTING':
        remaining += assignment.service_remaining
    if world.time + remaining > assignment.deadline + 0.001:
        reasons.append('Response/transport deadline is no longer feasible')
    return reasons
