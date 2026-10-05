from .models import WorldState


class Graph:
    def __init__(self, world: WorldState):
        self.nodes = world.nodes
        self.roads = world.roads
        self.adjacency = {key: [] for key in self.nodes}
        for road in self.roads.values():
            self.adjacency[road.a].append((road.b, road))
            self.adjacency[road.b].append((road.a, road))
        # Lower bound on cost per Manhattan unit, including every edge.
        self.scale = min((r.cost / (abs(self.nodes[r.a].x-self.nodes[r.b].x)
                         + abs(self.nodes[r.a].z-self.nodes[r.b].z))
                         for r in self.roads.values()), default=0)

    def neighbors(self, node):
        return [(n, r) for n, r in self.adjacency[node] if not r.blocked]

    def heuristic(self, a, b):
        a, b = self.nodes[a], self.nodes[b]
        return (abs(a.x-b.x) + abs(a.z-b.z)) * self.scale

    def edge(self, a, b):
        return next((r for n, r in self.adjacency[a] if n == b), None)
