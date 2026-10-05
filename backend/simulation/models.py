"""Serializable domain model. Locations always reference city graph nodes."""
from typing import Literal
from pydantic import BaseModel, Field, model_validator

IncidentType = Literal['FIRE', 'MEDICAL', 'ACCIDENT', 'FLOOD', 'INDUSTRIAL', 'EVACUATION']
ResourceType = Literal['AMBULANCE', 'FIRE_TRUCK', 'RESCUE_TEAM']


class Node(BaseModel):
    id: str
    x: float
    z: float


class Road(BaseModel):
    id: str
    a: str
    b: str
    distance: float = Field(gt=0)
    travel_time: float = Field(gt=0)
    risk: float = Field(default=0, ge=0)
    blocked: bool = False
    known: bool = True
    actual_blocked: bool = False

    @property
    def cost(self):
        return self.travel_time + self.risk


class Building(BaseModel):
    id: str
    name: str
    kind: str
    node: str
    x: float
    z: float
    height: float = 3


class Hospital(BaseModel):
    id: str
    name: str
    location: str
    total_beds: int = Field(ge=0)
    occupied_beds: int = Field(ge=0)
    icu_beds: int = Field(ge=0)
    occupied_icu: int = Field(ge=0)
    available: bool = True
    capabilities: list[str] = ['emergency', 'critical']

    @model_validator(mode='after')
    def valid_capacity(self):
        if self.occupied_beds > self.total_beds or self.occupied_icu > self.icu_beds:
            raise ValueError('Capacity cannot be lower than current occupancy')
        if self.icu_beds > self.total_beds or self.occupied_icu > self.occupied_beds:
            raise ValueError('ICU beds and occupancy must be included in total beds')
        return self


class Resource(BaseModel):
    id: str
    type: ResourceType
    location: str
    available: bool = True
    status: str = 'IDLE'
    capabilities: list[str] = []
    assigned_incident: str | None = None


class Patient(BaseModel):
    id: str
    incident_id: str
    critical: bool = False
    status: str = 'WAITING'
    hospital_id: str | None = None
    location: str | None = None


class Incident(BaseModel):
    id: str
    type: IncidentType
    location: str
    severity: int = Field(ge=1, le=5)
    affected_population: int = Field(ge=0, le=10000)
    created_at: float
    priority: int = 1
    status: str = 'WAITING'
    required_resources: list[str] = []
    assigned_resources: list[str] = []
    completed_tasks: list[str] = []


class Route(BaseModel):
    path: list[str] = []
    cost: float = 0
    travel_time: float = 0
    explored: list[str] = []
    algorithm: str = 'A*'
    reachable: bool = False


class Assignment(BaseModel):
    id: str
    task_id: str
    incident_id: str
    resource_id: str
    patient_id: str | None = None
    hospital_id: str | None = None
    route: Route
    response_route: Route
    transport_route: Route | None = None
    phase: str = 'RESPONDING'
    edge_progress: float = 0
    service_remaining: float = 6
    created_at: float
    deadline: float
    priority: int


class Decision(BaseModel):
    id: str
    timestamp: float
    stage: str
    algorithm: str
    summary: str
    entities: list[str] = []
    evidence: dict = {}


class Event(BaseModel):
    id: str
    timestamp: float
    type: str
    payload: dict


class Plan(BaseModel):
    revision: int = 0
    assignments: list[Assignment] = []
    unassigned: dict[str, str] = {}
    stats: dict = {}


class WorldState(BaseModel):
    nodes: dict[str, Node] = {}
    roads: dict[str, Road] = {}
    buildings: list[Building] = []
    hospitals: dict[str, Hospital] = {}
    resources: dict[str, Resource] = {}
    incidents: dict[str, Incident] = {}
    patients: dict[str, Patient] = {}
    plan: Plan = Field(default_factory=Plan)
    time: float = 0
    running: bool = False
    ai_status: str = 'OBSERVING'
    events: list[Event] = []
    decisions: list[Decision] = []
    facts: list[dict] = []
    demo_step: int = 0
    demo_active: bool = False
    version: int = 0
