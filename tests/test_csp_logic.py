from backend.ai.csp.backtracking import solve
from backend.ai.csp.propagation import propagate
from backend.ai.csp.constraints import Task, Option, consistent
from backend.ai.logic.inference import reason, Rule, forward_chain
from backend.ai.logic.knowledge_base import KnowledgeBase, Fact
from backend.ai.planning.local_search import improve
from backend.simulation.models import Route
from backend.simulation.city import seed_world
from conftest import medical


def test_true_backtracking_recovers_from_bad_first_choice():
    tasks = [Task(x, x, 'AMBULANCE', 3, 100) for x in ['a', 'b', 'c']]
    domains = {'a': [1, 2, None], 'b': [1, 3, None], 'c': [1, 3, None]}
    compatible = lambda values: len([v for v in values if v is not None]) == len({v for v in values if v is not None})
    result, stats = solve(tasks, domains, compatible)
    assert result['a'] == 2
    assert all(v is not None for v in result.values())
    assert stats['backtracks'] > 0 and stats['pruned_values'] > 0


def test_propagation_removes_conflicting_values():
    domains, removed = propagate({'b': [1, 2, None]}, [1], lambda vs: vs.count(1) < 2)
    assert domains == {'b': [2, None]} and removed == 1


def test_priority_dominates_lower_priority_service_count():
    tasks = [Task('a', 'a', 'AMBULANCE', 1, 100), Task('b', 'b', 'AMBULANCE', 5, 100)]
    result, _ = solve(tasks, {'a': [1, None], 'b': [1, None]}, lambda vs: vs.count(1) <= 1)
    assert result == {'a': None, 'b': 1}


def test_fixed_point_forward_chaining_and_trace():
    kb = KnowledgeBase()
    a, b, c = [Fact(x, 'subject') for x in 'abc']
    kb.add(a)
    rules = [Rule('second', (b,), c), Rule('first', (a,), b)]
    forward_chain(kb, rules)
    assert c in kb.facts and kb.trace[-1]['rule'] == 'second'
    assert kb.trace[-1]['premises'] == ['b(subject, True)']
    forward_chain(kb, rules)
    assert len(kb.trace) == 3


def test_fire_infers_evacuate_then_rescue(sim):
    sim.demo()
    kb = reason(sim.world)
    assert kb.has('evacuation_required', 'FACTORY-FIRE')
    assert kb.has('rescue_required', 'FACTORY-FIRE')
    assert sim.world.incidents['FACTORY-FIRE'].priority == 5
    assert kb.has('icu_required', 'FACTORY-FIRE-P1')


def test_capacity_and_resource_uniqueness():
    w = seed_world()
    r = Route(path=['N00'], reachable=True)
    a, b = Option('AMB-01', 'H1', r, r, True), Option('AMB-02', 'H1', r, r, True)
    assert consistent([a], w)
    assert not consistent([a, b], w)
    assert not consistent([a, a], w)


def test_allocator_respects_icu_scarcity_and_compatibility(sim):
    medical(sim, patients=3, critical=3)
    assignments = sim.world.plan.assignments
    assert len(assignments) == 2 and len(sim.world.plan.unassigned) == 1
    assert {a.hospital_id for a in assignments} == {'H1', 'H2'}
    assert all(sim.world.resources[a.resource_id].type == 'AMBULANCE' for a in assignments)


def test_local_search_improves_feasible_allocation():
    costly = Option('AMB-01', None, Route(cost=20), None)
    cheap = Option('AMB-02', None, Route(cost=3), None)
    result, stats = improve({'task': costly}, {'task': [costly, cheap, None]}, lambda vs: True)
    assert result['task'] == cheap
    assert stats['after'] < stats['before'] and stats['improvements'] == 1


def test_pair_exchange_escapes_single_move_conflict():
    a = Option('A', None, Route(cost=20), None)
    b = Option('B', None, Route(cost=20), None)
    swap_a = Option('B', None, Route(cost=1), None)
    swap_b = Option('A', None, Route(cost=1), None)
    compatible = lambda vs: len({v.resource_id for v in vs if v}) == len([v for v in vs if v])
    result, stats = improve({'a': a, 'b': b}, {'a': [a, swap_a], 'b': [b, swap_b]}, compatible)
    assert result['a'].resource_id == 'B' and result['b'].resource_id == 'A'
    assert stats['after'] == 2
