from backend.simulation.models import Decision


def record(world, stage, algorithm, summary, entities=None, **evidence):
    decision = Decision(id=f'D{len(world.decisions)+1:05}', timestamp=world.time,
                        stage=stage, algorithm=algorithm, summary=summary,
                        entities=entities or [], evidence=evidence)
    world.decisions.append(decision)
    world.ai_status = stage
    return decision
