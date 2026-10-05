"""Grounded Horn-style rules, iterated to a fixed point with proof traces."""
from dataclasses import dataclass
from .knowledge_base import Fact, KnowledgeBase


@dataclass(frozen=True)
class Rule:
    name: str
    premises: tuple[Fact, ...]
    conclusion: Fact


def forward_chain(kb, rules):
    changed = True
    while changed:
        changed = False
        for rule in rules:
            if all(f in kb.facts for f in rule.premises):
                changed |= kb.add(rule.conclusion, rule.name, rule.premises)
    return kb


def reason(world):
    kb, rules = KnowledgeBase(), []
    for incident in world.incidents.values():
        if incident.status == 'RESOLVED':
            continue
        id = incident.id
        kb.add(Fact('incident_type', id, incident.type))
        kb.add(Fact('severity', id, incident.severity))
        kb.add(Fact('population', id, incident.affected_population))
        kb.add(Fact('priority', id, incident.severity))
        if incident.severity >= 4:
            kb.add(Fact('severe', id))
        if incident.affected_population >= 30:
            kb.add(Fact('crowded', id))
        if incident.type in ('FIRE', 'INDUSTRIAL'):
            kb.add(Fact('fire_detected', id))
        if incident.type in ('FLOOD', 'EVACUATION', 'ACCIDENT', 'INDUSTRIAL'):
            kb.add(Fact('rescue_required', id))
        rules.extend([
            Rule('R1: fire in populated area requires evacuation',
                 (Fact('fire_detected', id), Fact('crowded', id)), Fact('evacuation_required', id)),
            Rule('R2: severe incident with many people is critical',
                 (Fact('severe', id), Fact('crowded', id)), Fact('priority', id, 5)),
            Rule('R3: evacuation requires a rescue team',
                 (Fact('evacuation_required', id),), Fact('rescue_required', id)),
            Rule('R4: detected fire requires a fire truck',
                 (Fact('fire_detected', id),), Fact('fire_response_required', id)),
        ])
    for patient in world.patients.values():
        if patient.critical and patient.status != 'ADMITTED':
            kb.add(Fact('critical_patient', patient.id))
            rules.append(Rule('R5: critical patient needs ICU', (Fact('critical_patient', patient.id),),
                              Fact('icu_required', patient.id)))
    for hospital in world.hospitals.values():
        if hospital.available and hospital.icu_beds > hospital.occupied_icu:
            kb.add(Fact('icu_available', hospital.id))
    for road in world.roads.values():
        if road.blocked:
            kb.add(Fact('road_blocked', road.id))
            rules.append(Rule('R6: blocked road excludes traversal', (Fact('road_blocked', road.id),),
                              Fact('route_constraint_active', road.id)))
    forward_chain(kb, rules)
    for incident in world.incidents.values():
        priorities = [f.value for f in kb.facts if f.subject == incident.id and f.predicate == 'priority']
        if priorities:
            incident.priority = max(priorities)
    world.facts = kb.trace
    return kb
