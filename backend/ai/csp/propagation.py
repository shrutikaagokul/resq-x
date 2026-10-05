def propagate(domains, assigned, compatible):
    """Forward checking removes values inconsistent with the partial assignment."""
    filtered, removed = {}, 0
    for variable, values in domains.items():
        filtered[variable] = [v for v in values if compatible(assigned + [v])]
        removed += len(values) - len(filtered[variable])
    return filtered, removed
