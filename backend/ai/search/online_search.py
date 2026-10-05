"""Sense only the next edge, then let the central planner repair the plan."""


def discover(graph, route):
    if len(route.path) < 2:
        return None
    road = graph.edge(*route.path[:2])
    if road.known:
        return None
    road.known = True
    road.blocked = road.actual_blocked
    return {'road_id': road.id, 'blocked': road.blocked}
