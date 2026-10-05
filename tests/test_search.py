import pytest
from backend.simulation.city import seed_world
from backend.simulation.graph import Graph
from backend.ai.search.algorithms import search
from backend.ai.search.online_search import discover


@pytest.mark.parametrize('algorithm', ['BFS', 'DFS', 'UCS', 'Greedy', 'A*'])
def test_search_route_and_blockage(algorithm):
    w = seed_world()
    w.roads['N00-N01'].blocked = True
    graph = Graph(w)
    route = search(graph, 'N00', 'N44', algorithm)
    assert route.reachable and route.path[0] == 'N00' and route.path[-1] == 'N44'
    assert len(route.path) == len(set(route.path))
    assert all(not graph.edge(a, b).blocked for a, b in zip(route.path, route.path[1:]))
    assert route.cost == sum(graph.edge(a, b).cost for a, b in zip(route.path, route.path[1:]))


def test_astar_matches_ucs_with_weighted_costs():
    w = seed_world()
    w.roads['N00-N01'].risk = 100
    graph = Graph(w)
    for goal in w.nodes:
        assert search(graph, 'N00', goal, 'A*').cost == search(graph, 'N00', goal, 'UCS').cost
        assert graph.heuristic('N00', goal) <= search(graph, 'N00', goal, 'UCS').cost


@pytest.mark.parametrize('algorithm', ['BFS', 'DFS', 'UCS', 'Greedy', 'A*'])
def test_no_path_and_same_node(algorithm):
    w = seed_world()
    for r in w.roads.values():
        r.blocked = True
    graph = Graph(w)
    assert not search(graph, 'N00', 'N44', algorithm).reachable
    same = search(graph, 'N00', 'N00', algorithm)
    assert same.path == ['N00'] and same.cost == 0


def test_bfs_minimum_hops():
    graph = Graph(seed_world())
    assert len(search(graph, 'N00', 'N44', 'BFS').path) == 9


def test_online_observation():
    w = seed_world()
    r = w.roads['N00-N01']
    r.known, r.actual_blocked = False, True
    graph = Graph(w)
    route = search(graph, 'N00', 'N01')
    assert route.reachable and not r.blocked
    assert discover(graph, route) == {'road_id': r.id, 'blocked': True}
    assert r.blocked and r.known
    assert search(graph, 'N00', 'N01').path != route.path


def test_invalid_node_or_algorithm():
    graph = Graph(seed_world())
    with pytest.raises(ValueError):
        search(graph, 'UNKNOWN', 'N00')
    with pytest.raises(ValueError):
        search(graph, 'N00', 'N01', 'FAKE')
