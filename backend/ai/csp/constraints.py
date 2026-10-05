from dataclasses import dataclass
from backend.simulation.models import Route


@dataclass(frozen=True)
class Task:
    id: str
    incident_id: str
    kind: str
    priority: int
    deadline: float
    patient_id: str | None = None


@dataclass
class Option:
    resource_id: str
    hospital_id: str | None
    response: Route
    transport: Route | None
    critical: bool = False

    @property
    def cost(self):
        return self.response.cost + (self.transport.cost if self.transport else 0)


def consistent(options, world):
    """Global all-different resource constraint plus cumulative bed constraints."""
    used, beds, icus = set(), {}, {}
    for option in options:
        if option is None:
            continue
        if option.resource_id in used:
            return False
        used.add(option.resource_id)
        if option.hospital_id:
            h = world.hospitals[option.hospital_id]
            beds[h.id] = beds.get(h.id, 0) + 1
            icus[h.id] = icus.get(h.id, 0) + int(option.critical)
            if (not h.available or beds[h.id] + h.occupied_beds > h.total_beds
                    or icus[h.id] + h.occupied_icu > h.icu_beds):
                return False
    return True
