from backend.ai.planning.planner import plan
from backend.ai.planning.decision_explanation import record
from backend.ai.planning.plan_validator import validate, as_option
from backend.ai.search.online_search import discover
from .city import seed_world
from .graph import Graph
from .models import Event, Hospital, Incident, Patient


class Simulation:
    def __init__(self, database):
        self.database = database
        self.world = database.load() or seed_world()
        self.save()

    def save(self):
        self.database.save(self.world)

    def reset(self):
        self.world = seed_world()
        self.save()

    def event(self, kind, payload):
        w = self.world
        w.events.append(Event(id=f'E{len(w.events)+1:05}', timestamp=w.time, type=kind, payload=payload))
        record(w, 'CHANGE DETECTED', 'World observation', kind.replace('_', ' ').capitalize(), **payload)

    def incident(self, data, replan=True):
        w = self.world
        if data['location'] not in w.nodes:
            raise ValueError('Unknown incident location')
        id = data.get('id') or f'INC-{len(w.incidents)+1:03}'
        if id in w.incidents:
            raise ValueError('Incident ID already exists')
        count, critical = data.get('patients', 0), data.get('critical_patients', 0)
        if critical > count:
            raise ValueError('Critical patients cannot exceed total patients')
        incident = Incident(id=id, type=data['type'], location=data['location'], severity=data['severity'],
                            affected_population=data['affected_population'], created_at=w.time)
        w.incidents[id] = incident
        for n in range(count):
            p = Patient(id=f'{id}-P{n+1}', incident_id=id, critical=n < critical)
            w.patients[p.id] = p
        self.event('new_emergency', incident.model_dump())
        if replan:
            plan(w, f'New {incident.type.lower()} incident {id}')
            self.save()
        return incident

    def change(self, kind, data):
        w = self.world
        if kind in ('road-block', 'road-reopen', 'road-unknown'):
            road = w.roads.get(data['road_id'])
            if not road:
                raise ValueError('Unknown road')
            road.actual_blocked = kind != 'road-reopen'
            road.known = kind != 'road-unknown'
            road.blocked = road.actual_blocked if road.known else False
        elif kind == 'hospital-change':
            id = data['hospital_id']
            if id not in w.hospitals:
                raise ValueError('Unknown hospital')
            updates = {k: v for k, v in data.items() if k != 'hospital_id' and v is not None}
            w.hospitals[id] = Hospital.model_validate({**w.hospitals[id].model_dump(), **updates})
        elif kind in ('vehicle-failure', 'vehicle-restore'):
            resource = w.resources.get(data['resource_id'])
            if not resource:
                raise ValueError('Unknown resource')
            resource.available = kind == 'vehicle-restore'
            resource.status = 'IDLE' if resource.available else 'FAILED'
        elif kind == 'incident-change':
            id = data['incident_id']
            if id not in w.incidents or w.incidents[id].status == 'RESOLVED':
                raise ValueError('Unknown or resolved incident')
            updates = {k: v for k, v in data.items() if k != 'incident_id' and v is not None}
            w.incidents[id] = Incident.model_validate({**w.incidents[id].model_dump(), **updates})
        else:
            raise ValueError('Unknown event')
        self.event(kind, data)
        plan(w, kind)
        self.save()

    def demo(self):
        self.reset()
        self.world.demo_active = True
        self.world.demo_step = 1
        self.incident({'id': 'FACTORY-FIRE', 'type': 'INDUSTRIAL', 'location': 'N23',
                       'severity': 4, 'affected_population': 80, 'patients': 2, 'critical_patients': 2})
        self.world.running = True
        self.save()

    def demo_events(self):
        w = self.world
        if not w.demo_active:
            return
        if w.demo_step == 1 and w.time >= 4:
            target = next((a for a in w.plan.assignments if len(a.route.path) > 1 and a.resource_id == 'FIRE-01'), None)
            if target:
                road = Graph(w).edge(*target.route.path[:2])
                self.change('road-block', {'road_id': road.id})
            w.demo_step = 2
        if w.demo_step == 2 and w.time >= 9:
            self.change('hospital-change', {'hospital_id': 'H1', 'icu_beds': 1})
            w.demo_step = 3
        if w.demo_step == 3 and w.time >= 14:
            self.incident({'id': 'SCHOOL-ACCIDENT', 'type': 'ACCIDENT', 'location': 'N12',
                           'severity': 5, 'affected_population': 35, 'patients': 1, 'critical_patients': 0})
            w.demo_step = 4
        if w.demo_step == 4 and w.time >= 19:
            target = next((a for a in w.plan.assignments if len(a.route.path) > 1), None)
            if target:
                road = Graph(w).edge(*target.route.path[:2])
                self.change('road-unknown', {'road_id': road.id})
            w.demo_step = 5

    def tick(self, seconds=0.5):
        if not self.world.running:
            return
        w = self.world
        w.time = round(w.time + seconds, 3)
        self.demo_events()
        reservations = []
        for assignment in w.plan.assignments:
            if validate(assignment, w, Graph(w), reservations):
                plan(w, 'Pre-execution validation failed')
                break
            reservations.append(as_option(assignment, w))
        graph, completed = Graph(w), []
        discovered = False
        for assignment in list(w.plan.assignments):
            resource = w.resources[assignment.resource_id]
            observation = discover(graph, assignment.route)
            if observation:
                self.event('road_discovered', observation)
                discovered = True
                if observation['blocked']:
                    continue
            if len(assignment.route.path) > 1:
                edge = graph.edge(*assignment.route.path[:2])
                if edge.blocked:
                    discovered = True
                    continue
                assignment.edge_progress += seconds
                if assignment.edge_progress >= edge.travel_time:
                    assignment.edge_progress -= edge.travel_time
                    assignment.route.path.pop(0)
                    assignment.route.cost = max(0, assignment.route.cost - edge.cost)
                    assignment.route.travel_time = max(0, assignment.route.travel_time - edge.travel_time)
                    resource.location = assignment.route.path[0]
                    if assignment.patient_id and assignment.phase == 'TRANSPORTING':
                        w.patients[assignment.patient_id].location = resource.location
            else:
                assignment.edge_progress = 0
                if assignment.phase == 'RESPONDING':
                    assignment.phase, resource.status = 'ON_SCENE', 'ON_SCENE'
                if assignment.phase == 'ON_SCENE':
                    assignment.service_remaining -= seconds
                    if assignment.service_remaining <= 0:
                        if assignment.patient_id:
                            assignment.phase, resource.status = 'TRANSPORTING', 'TRANSPORTING'
                            assignment.route = assignment.transport_route.model_copy(deep=True)
                            patient = w.patients[assignment.patient_id]
                            patient.status, patient.location = 'IN_TRANSIT', resource.location
                        else:
                            completed.append(assignment)
                elif assignment.phase == 'TRANSPORTING':
                    hospital = w.hospitals[assignment.hospital_id]
                    patient = w.patients[assignment.patient_id]
                    hospital.occupied_beds += 1
                    hospital.occupied_icu += int(patient.critical)
                    patient.status, patient.location = 'ADMITTED', hospital.location
                    completed.append(assignment)
        for assignment in completed:
            w.plan.assignments.remove(assignment)
            resource = w.resources[assignment.resource_id]
            resource.status, resource.assigned_incident = 'IDLE', None
            w.incidents[assignment.incident_id].completed_tasks.append(assignment.task_id)
            record(w, 'EXECUTING', 'Plan execution', f'{assignment.resource_id}: task {assignment.task_id} completed',
                   [assignment.resource_id], hospital_id=assignment.hospital_id)
        if completed:
            from backend.ai.csp.allocator import tasks_for
            from backend.ai.logic.inference import reason
            remaining = tasks_for(w, reason(w))
            for incident in w.incidents.values():
                if not any(t.incident_id == incident.id for t in remaining):
                    incident.status = 'RESOLVED'
        if completed or discovered:
            plan(w, 'Task completed / new road observation')
        else:
            w.ai_status = 'EXECUTING' if w.plan.assignments else 'OBSERVING'
        w.version += 1
        self.save()
