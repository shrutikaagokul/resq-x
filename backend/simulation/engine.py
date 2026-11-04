from backend.ai.planning.planner import plan
from backend.ai.planning.decision_explanation import record
from backend.ai.planning.plan_validator import validate, as_option
from backend.ai.search.algorithms import astar
from backend.ai.search.online_search import discover
from .city import seed_world, expand_city
from .graph import Graph
from .models import Event, Hospital, Incident, Patient
from .incident_lifecycle import update_incident_lifecycles
from .patient_health import init_patient_health, update_all_patients_health
from .traffic import (
    init_all_traffic, apply_traffic_to_roads, apply_emergency_priority,
    evolve_traffic, routes_need_replan,
    increase_congestion, decrease_congestion,
    create_traffic_incident, clear_traffic_incident,
)

# Minimum fractional improvement required to switch an active route.
# Prevents unnecessary churn for tiny cost differences.
_ROUTE_IMPROVEMENT_THRESHOLD = 0.05  # 5 %


class Simulation:
    def __init__(self, database):
        self.database = database
        self.world = database.load() or seed_world()
        if self.world.layout_version < 2:
            expand_city(self.world)
            self.event('city_expanded', {'layout_version': 2, 'nodes': len(self.world.nodes),
                                         'roads': len(self.world.roads), 'hospitals': len(self.world.hospitals)})
            plan(self.world, 'City expanded; existing state preserved')
        init_all_traffic(self.world)
        apply_traffic_to_roads(self.world)
        self.save()

    def update_incident_lifecycles(self):
        return update_incident_lifecycles(self.world, event_callback=self.event)

    def _improve_routes_after_road_reopen(self, road_id: str) -> int:
        """Reconsider active RESPONDING routes when a blocked road re-opens.

        For each assignment whose vehicle is still en-route to its destination,
        A* is used to find the optimal path under current road conditions.
        If the new route is cheaper by more than _ROUTE_IMPROVEMENT_THRESHOLD,
        the assignment's route is replaced and the decision is recorded.

        Only RESPONDING assignments (not ON_SCENE or TRANSPORTING) are
        reconsidered, because those vehicles still have meaningful route
        choices ahead of them.  The vehicle's current position and progress
        within its current edge are preserved exactly.

        Returns the number of routes that were improved.
        """
        w = self.world
        graph = Graph(w)
        improved = 0
        for assignment in w.plan.assignments:
            # Skip vehicles that have already arrived or are transporting patients
            if assignment.phase != 'RESPONDING':
                continue
            path = assignment.route.path
            if len(path) < 2:
                continue
            # Current position is path[0] (start of the remaining edge segment)
            current_node = path[0]
            destination = path[-1]
            # Recompute optimal route with current road conditions
            new_route = astar(graph, current_node, destination)
            if not new_route.reachable:
                continue
            # Compare against remaining cost of current assignment route
            current_cost = sum(
                edge.cost
                for a_node, b_node in zip(path, path[1:])
                for edge in [graph.edge(a_node, b_node)]
                if edge is not None
            )
            if current_cost <= 0:
                continue
            improvement = (current_cost - new_route.cost) / current_cost
            if improvement > _ROUTE_IMPROVEMENT_THRESHOLD:
                old_path = list(path)
                assignment.route = new_route
                improved += 1
                record(w, 'ROUTING', 'A* route improvement',
                       f'{assignment.resource_id}: better route available after {road_id} re-opened'
                       f' ({old_path} → {new_route.path},'
                       f' cost {current_cost:.1f} → {new_route.cost:.1f})',
                       [assignment.resource_id],
                       road_id=road_id,
                       old_path=old_path,
                       new_path=new_route.path,
                       cost_before=round(current_cost, 3),
                       cost_after=round(new_route.cost, 3),
                       improvement_pct=round(improvement * 100, 1))
        return improved

    def save(self):
        self.database.save(self.world)

    def reset(self):
        self.world = seed_world()
        init_all_traffic(self.world)
        apply_traffic_to_roads(self.world)
        self.save()

    def event(self, kind, payload):
        w = self.world
        w.events.append(Event(id=f'E{len(w.events)+1:05}', timestamp=w.time, type=kind, payload=payload))
        summary = kind.replace('_', ' ').capitalize()
        if kind == 'patient_condition_change' and 'previous_condition' in payload and 'new_condition' in payload:
            summary = f"Patient {payload.get('patient_id', '')} condition: {payload['previous_condition']} → {payload['new_condition']}"
        record(w, 'CHANGE DETECTED', 'World observation', summary, **payload)

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
                            affected_population=data['affected_population'], created_at=w.time, status='NEW')
        w.incidents[id] = incident
        for n in range(count):
            p = Patient(id=f'{id}-P{n+1}', incident_id=id, critical=n < critical)
            init_patient_health(p)
            w.patients[p.id] = p
        self.event('new_emergency', incident.model_dump())
        if replan:
            plan(w, f'New {incident.type.lower()} incident {id}')
            self.update_incident_lifecycles()
            self.save()
        else:
            self.update_incident_lifecycles()
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
        elif kind == 'traffic-congestion':
            payload = increase_congestion(w, data['road_id'], data.get('levels', 1))
            self.event(kind, payload)
            plan(w, f'Traffic congestion increased on {data["road_id"]}')
            self.save()
            return
        elif kind == 'traffic-clear':
            payload = decrease_congestion(w, data['road_id'], data.get('levels', 2))
            self.event(kind, payload)
            plan(w, f'Traffic congestion reduced on {data["road_id"]}')
            self.save()
            return
        elif kind == 'traffic-incident':
            payload = create_traffic_incident(w, data['road_id'])
            self.event(kind, payload)
            plan(w, f'Traffic incident on {data["road_id"]}')
            self.save()
            return
        elif kind == 'traffic-incident-clear':
            payload = clear_traffic_incident(w, data['road_id'])
            self.event(kind, payload)
            plan(w, f'Traffic incident cleared on {data["road_id"]}')
            self.update_incident_lifecycles()
            self.save()
            return
        else:
            raise ValueError('Unknown event')
        self.event(kind, data)
        if kind == 'hospital-change':
            plan(w, kind, allow_late_rescue=True)
        else:
            plan(w, kind)
        # When a road re-opens, the standard planner only invalidates routes that
        # pass through still-blocked roads.  Valid routes computed around the
        # former blockage are kept unchanged even if the re-opened road provides a
        # shorter alternative.  Apply a targeted route-improvement pass here so
        # that RESPONDING vehicles can switch to the newly optimal path.
        if kind == 'road-reopen':
            self._improve_routes_after_road_reopen(data['road_id'])
        self.update_incident_lifecycles()
        self.save()

    def demo(self):
        self.reset()
        self.world.demo_active = True
        self.world.demo_step = 1
        # A responder starts in the added east district so the demonstration
        # visibly exercises the expanded routing graph as well as the old core.
        self.world.resources['RES-02'].location = 'X77'
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
        w.traffic_seed += 1
        self.demo_events()
        # ── Traffic update (before Graph construction so algorithms use new costs) ─────
        traffic_changes = evolve_traffic(w, seconds)
        apply_traffic_to_roads(w)
        apply_emergency_priority(w)
        if traffic_changes:
            # Emit events only for level transitions
            for change in traffic_changes:
                self.event('traffic_level_change', change)
        replan_traffic = routes_need_replan(w)
        # ── Patient health ───────────────────────────────────────────────────
        transitions = update_all_patients_health(w, seconds)
        became_critical = False
        for transition in transitions:
            self.event('patient_condition_change', transition)
            if transition['new_condition'] == 'CRITICAL' and transition['critical_changed']:
                became_critical = True
        if became_critical:
            plan(w, 'Patient condition escalated to CRITICAL')
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
        if completed or discovered:
            plan(w, 'Task completed / new road observation')
        elif replan_traffic:
            plan(w, 'Traffic congestion changed route cost significantly')
        else:
            w.ai_status = 'EXECUTING' if w.plan.assignments else 'OBSERVING'
        self.update_incident_lifecycles()
        w.version += 1
        self.save()
