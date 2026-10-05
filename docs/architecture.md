# Architecture and state ownership

## The authoritative world

`backend/simulation/models.py` defines Node, Road, Building, Hospital, Resource, Incident, Patient, Route, Assignment, Plan, Decision, Event and WorldState. IDs reference graph nodes and entities consistently. Hospitals validate their capacities: ICU is a subset of beds, occupied counts cannot exceed totals, and occupied ICU cannot exceed occupied beds.

`city.seed_world()` creates a deterministic 5×5 grid with horizontal and vertical edges. Each edge stores distance, travel time, nonnegative risk, known blockage and hidden physical blockage. The Graph view builds adjacency from those very roads; it never maintains a separate routing map.

WorldState includes the graph, hospitals, resources, incidents, patients, plan/assignments, clock, reasoning facts and event/decision history. There is one Simulation per FastAPI application, created in its lifespan. The asyncio clock advances once every 500 ms while running. Endpoints and clock mutations execute synchronously on that single loop, preventing interleaved world writes. Run one worker.

## Request → decision → execution

1. Pydantic validates the REST request. Domain references and capacity relationships are checked before mutating an entity.
2. Simulation records the event and changes the world.
3. Planner gathers observed facts, runs rules to a fixed point, and constructs response tasks.
4. PlanValidator checks existing assignments against the new graph, availability, destination, remaining time and cumulative reservations.
5. Valid assignments are preserved with their progress and IDs. Lower-priority response reservations are released only if needed to enable a feasible higher-priority task.
6. Invalid assignments produce a structured explanation containing the old assignment and reasons. Onboard patients keep a functioning ambulance when a feasible hospital reroute exists.
7. CSP builds domains using A* routes, solves joint constraints and exposes unassigned tasks. Hill climbing improves route cost without dropping served tasks.
8. Backend ticks execute routes. Reaching the incident starts service, service completion picks up the patient or completes the response, and hospital arrival converts a reservation to occupied capacity. A completed task releases its vehicle and triggers allocation for waiting tasks.
9. Unknown road information is sensed immediately before traversing the next edge. Discovery records a fact change and triggers validation/repair before crossing a blocked road.

## Hospital reservations

Occupied beds count admitted patients. Active ambulance assignments reserve future beds and, for critical patients, ICU slots. Reservation totals are derived from assignments rather than duplicated mutable counters. Both allocation and validation check `occupied + reserved ≤ capacity`. Admission increments occupancy as the corresponding assignment is removed. This prevents two ambulances independently claiming the same ICU bed.

## Frontend mapping

React + Zustand polls `/world-state` every 500 ms. A mutation suppresses polling and invalidates older in-flight reads so a stale response cannot overwrite a newer action. Errors appear in a dismissible banner. Request timeouts prevent indefinite busy states.

React Three Fiber uses the backend node coordinates directly. Roads join their endpoint coordinates; barricades use the backend blocked flag; buildings reference the same nodes. Route lines use the assignment's node path, and vehicle movement interpolates its current backend edge and elapsed traversal progress. The frontend does not choose routes, priorities, assignments or hospitals. All scene geometry and text are local; no remote model, map or font service is needed.

The city uses an orthographic 3D camera with orbit/pan/zoom, dimensional building/vehicle geometry, lights, shadows and depth. It is not a 2D map. Responsive panels stack below the scene on narrow screens.

## Persistence

SQLite stores an atomic JSON snapshot plus queryable incident, resource, hospital, assignment, decision and event tables. A save runs in one transaction. Restart restores the snapshot paused; reset replaces it with deterministic seed data. Tests use temporary or in-memory databases.

The simple full-snapshot approach is suitable for short simulations. A production data model would use append-only event storage and incremental writes. No production emergency-service guarantees are implied.

## Failure semantics

- Invalid input returns HTTP 422, unknown endpoints/decisions return 404.
- No compatible resource, no capacity, unreachable destination or missed deadline produces a visible unassigned task and decision evidence.
- An unavailable vehicle is never routed. If it fails while carrying a patient, that patient's last reached node becomes the replacement pickup location.
- If a road changes mid-edge, repair begins at the last reached node; the display smooths the position correction.
- Restore/reopen events can make waiting tasks feasible. Preserved valid plans are not globally rerouted merely to chase every potential small improvement.
