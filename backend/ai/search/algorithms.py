"""Readable graph searches with a common result contract; no search libraries."""
from collections import deque
from heapq import heappop, heappush
from itertools import count
from backend.simulation.models import Route


def result(graph, goal, parents, explored, algorithm):
    path = [goal]
    while parents[path[-1]] is not None:
        path.append(parents[path[-1]])
    path.reverse()
    edges = [graph.edge(a, b) for a, b in zip(path, path[1:])]
    return Route(path=path, cost=sum(e.cost for e in edges),
                 travel_time=sum(e.travel_time for e in edges), explored=explored,
                 algorithm=algorithm, reachable=True)


def search(graph, start, goal, algorithm='A*'):
    if algorithm not in ('BFS', 'DFS', 'UCS', 'Greedy', 'A*'):
        raise ValueError('Unknown search algorithm')
    if start not in graph.nodes or goal not in graph.nodes:
        raise ValueError('Unknown graph node')
    explored, parents = [], {start: None}
    if algorithm in ('BFS', 'DFS'):
        frontier = deque([start])
        while frontier:
            node = frontier.popleft() if algorithm == 'BFS' else frontier.pop()
            explored.append(node)
            if node == goal:
                return result(graph, goal, parents, explored, algorithm)
            for neighbor, _ in graph.neighbors(node):
                if neighbor not in parents:
                    parents[neighbor] = node
                    frontier.append(neighbor)
    else:
        serial = count()
        frontier, costs = [(0, next(serial), start, 0)], {start: 0}
        while frontier:
            _, _, node, cost = heappop(frontier)
            if cost != costs[node]:
                continue
            explored.append(node)
            if node == goal:
                return result(graph, goal, parents, explored, algorithm)
            for neighbor, road in graph.neighbors(node):
                candidate = cost + road.cost
                if candidate < costs.get(neighbor, float('inf')):
                    costs[neighbor], parents[neighbor] = candidate, node
                    h = graph.heuristic(neighbor, goal)
                    priority = candidate if algorithm == 'UCS' else h if algorithm == 'Greedy' else candidate+h
                    heappush(frontier, (priority, next(serial), neighbor, candidate))
    return Route(algorithm=algorithm, explored=explored)


def astar(graph, start, goal):
    return search(graph, start, goal, 'A*')


def bfs(graph, start, goal):
    return search(graph, start, goal, 'BFS')


def dfs(graph, start, goal):
    return search(graph, start, goal, 'DFS')


def uniform_cost(graph, start, goal):
    return search(graph, start, goal, 'UCS')


def greedy(graph, start, goal):
    return search(graph, start, goal, 'Greedy')
