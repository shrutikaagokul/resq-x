def improve(assignment, domains, compatible):
    """Steepest feasible single-value / two-variable hill climbing.

    Preserve the CSP's served task set (and priority), minimize total route cost.
    Pair moves allow resources to exchange jobs without an infeasible interim state.
    """
    assignment = dict(assignment)
    cost = lambda a: sum(v.cost for v in a.values() if v is not None)
    before, steps = cost(assignment), 0
    while steps < 30:
        best, best_cost = assignment, cost(assignment)
        keys = [k for k, v in assignment.items() if v is not None]
        for i, key in enumerate(keys):
            for value in domains[key]:
                if value is None:
                    continue
                candidate = {**assignment, key: value}
                if cost(candidate) < best_cost and compatible(list(candidate.values())):
                    best, best_cost = candidate, cost(candidate)
                for other in keys[i+1:]:
                    for alternate in domains[other]:
                        if alternate is None:
                            continue
                        pair = {**candidate, other: alternate}
                        if cost(pair) < best_cost and compatible(list(pair.values())):
                            best, best_cost = pair, cost(pair)
        if best is assignment:
            break
        assignment, steps = best, steps+1
    return assignment, {'objective': 'total route travel time + road risk, fixed served tasks',
                         'before': before, 'after': cost(assignment), 'improvements': steps}
