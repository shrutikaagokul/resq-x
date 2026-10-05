"""Backtracking with MRV, priority ordering and forward constraint propagation."""
from .propagation import propagate


def solve(tasks, domains, compatible, budget=20000):
    task_by_id = {t.id: t for t in tasks}
    best, best_score = {}, (-1, -1, -1, -1, -1)
    stats = {'nodes': 0, 'backtracks': 0, 'pruned_values': 0, 'budget_exhausted': False}

    def score(assignment):
        return tuple(sum(v is not None and task_by_id[k].priority == p for k, v in assignment.items())
                     for p in range(5, 0, -1))

    def visit(assignment, remaining):
        nonlocal best, best_score
        if stats['nodes'] >= budget:
            stats['budget_exhausted'] = True
            return
        stats['nodes'] += 1
        current = score(assignment)
        if current > best_score:
            best, best_score = dict(assignment), current
        upper = tuple(current[5-p] + sum(task_by_id[k].priority == p and any(v is not None for v in values)
                     for k, values in remaining.items()) for p in range(5, 0, -1))
        if upper <= best_score or not remaining:
            return
        variable = min(remaining, key=lambda k: (-task_by_id[k].priority,
                                                 sum(v is not None for v in remaining[k]), k))
        for value in remaining[variable]:
            candidate = {**assignment, variable: value}
            if not compatible(list(candidate.values())):
                continue
            rest = {k: v for k, v in remaining.items() if k != variable}
            filtered, pruned = propagate(rest, list(candidate.values()), compatible)
            stats['pruned_values'] += pruned
            if all(filtered.values()):
                visit(candidate, filtered)
            stats['backtracks'] += 1
    visit({}, domains)
    return {t.id: best.get(t.id) for t in tasks}, stats
