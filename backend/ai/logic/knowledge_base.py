from dataclasses import dataclass


@dataclass(frozen=True)
class Fact:
    predicate: str
    subject: str
    value: object = True


class KnowledgeBase:
    def __init__(self):
        self.facts = set()
        self.trace = []

    def add(self, fact, rule='observed', premises=()):
        if fact in self.facts:
            return False
        self.facts.add(fact)
        self.trace.append({'predicate': fact.predicate, 'subject': fact.subject,
                           'value': fact.value, 'rule': rule,
                           'premises': [f'{f.predicate}({f.subject}, {f.value})' for f in premises]})
        return True

    def has(self, predicate, subject, value=True):
        return Fact(predicate, subject, value) in self.facts
