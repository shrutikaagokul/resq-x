# Classical AI: implementation and guarantees

## Search

Implementation: `backend/ai/search/algorithms.py`.

All five algorithms share a route result containing path, cost, travel time, explored nodes, algorithm and reachability. All use current known road blockages. An empty unreachable route is distinct from a reachable zero-cost route at the same node.

| Algorithm | Frontier ordering | Guarantee / intended use |
| --- | --- | --- |
| BFS | FIFO queue | Minimum edges on an unweighted graph; exploration comparison |
| DFS | LIFO stack | Reachability/exploration, no shortest-path guarantee |
| UCS | Accumulated cost `g` | Minimum cost with nonnegative edge costs |
| Greedy Best-First | Heuristic `h` | Goal-directed comparison, not guaranteed minimum cost |
| A* | `g + h` | Primary minimum-cost emergency routing |

Road cost is travel time plus nonnegative risk. Reported travel time excludes risk. The heuristic is Manhattan distance multiplied by the smallest edge cost per Manhattan coordinate unit across the graph. Every edge's cost is at least its scaled Manhattan length; the triangle inequality makes this heuristic admissible and consistent. A* maintains best-known costs, ignores stale heap entries and can reopen improved nodes. Tests compare A* to UCS for every destination with a weighted risky edge.

Online search is an explicit sense–update–replan loop, not a claim to implement LRTA*. Unknown roads are initially considered traversable. `online_search.discover()` senses only the next edge of a moving resource, updates known status from hidden simulated truth, and signals the central planner. This is a classical agent operating with incomplete graph knowledge.

## Logical inference

Implementation: `backend/ai/logic/`.

The knowledge base stores grounded facts `(predicate, subject, value)`. Rules are conjunctions of facts implying another fact. Forward chaining runs until no new fact is added. Facts are a set, so duplicate conclusions terminate naturally. Each inserted fact stores its observed/rule origin and premise strings.

Examples:

```text
fire_detected(i) ∧ crowded(i) → evacuation_required(i)
evacuation_required(i) → rescue_required(i)
severe(i) ∧ crowded(i) → priority(i, 5)
critical_patient(p) → icu_required(p)
road_blocked(r) → route_constraint_active(r)
```

Numeric severity and population are observed facts; threshold predicates ground the rules. Final priority is the maximum supported priority. This reasoning is not the whole AI: its conclusions drive task creation, CSP constraints, routing and subsequent execution/repair. The engine rebuilds current facts after changes, so stale inferred facts do not survive a changed premise.

## CSP formulation

Implementation: `backend/ai/csp/`.

- **Variables:** one per required fire response, rescue response or individual patient transport.
- **Domains:** tuples of resource, optional hospital, A* response route, A* transport route and ICU need. `None` explicitly means defer an infeasible/competing task; it is never executed as a fake assignment.
- **Unary constraints:** availability, resource type/capability, hospital availability/capability, patient criticality, route reachability, blocked roads and completion before an absolute deadline.
- **Global constraints:** all-different resource IDs and cumulative total-bed/ICU reservations including preserved plans.
- **Priority objective:** lexicographically maximize the number of served priority-5, then priority-4, …, priority-1 tasks. Critical patients have priority at least 5. Lower-priority tasks cannot displace a higher-priority feasible response solely to improve distance.
- **Ordering:** highest priority first, then minimum remaining non-null domain size (MRV), then stable task ID. Values are ordered by route cost, resource and hospital IDs.
- **Propagation:** forward checking filters each remaining domain against the partial assignment and existing reservations. This is real constraint propagation, not a claim of full AC-3 arc consistency.
- **Backtracking:** recursively tries alternative domain values after conflicts and uses an optimistic priority-coverage bound to prune branches. A node budget of 20,000 protects interactive latency; exhaustion is included in plan statistics. Best known feasible service is retained.

An adversarial test forces backtracking: a first choice prevents three tasks being jointly served, and the solver must revise that earlier choice. Other tests demonstrate distinct ambulances competing for one ICU slot and higher-priority tasks taking precedence.

Patient deadlines are 120 simulation seconds from incident creation for critical patients and 220 for other patients. Nonmedical tasks use 180 seconds. Six seconds of service is included in initial time feasibility. These are demonstrative constants, not real triage standards.

## Local search

Implementation: `backend/ai/planning/local_search.py`.

Once the CSP chooses a feasible served task set, steepest hill climbing minimizes:

```text
J = Σ (response route travel time + risk + transport route travel time + risk)
```

The served task set and therefore priority coverage stay fixed. Neighbors change one assignment or exchange options for a pair of assignments. Every neighbor passes the same global constraint check. Two-variable moves permit exchanging vehicles without requiring an infeasible intermediate assignment. Only strictly lower costs are accepted; the process stops at a local minimum or 30 improvements. Statistics report objective, before/after and number of improvements. This is not a guarantee of the globally shortest allocation.

## Plan validation and dynamic replanning

Implementation: `backend/ai/planning/`.

Validation checks remaining route edges, route origin/destination, resource type/capability/availability, hospital availability/capability, cumulative reservations and deadline. It returns an empty reason list for VALID or concrete reasons for INVALID. The planner processes assignments in priority order so reservations that survive capacity shrinkage are deterministic.

On changes, valid assignments retain their IDs, routes and progress. Invalid plans store the previous assignment and reasons in the decision log. The allocator repairs the remaining tasks. Higher-priority pending work can displace a compatible lower-priority response only when releasing that reservation makes the pending work feasible. Transporting patients are not preempted for an unrelated emergency.

If an onboard patient's hospital becomes unavailable, feasible alternate hospitals are searched while preserving the working vehicle and its patient. Resource failure can instead require another ambulance to travel to the patient's last known node. The complete demo test validates every active plan and every hospital's capacity at each simulation tick.

## What WHY explains

An assignment decision records the chosen resource/patient/hospital, priority, deadline, routes, explored nodes, rule premises, initial feasible candidate count, enforced constraints and rejected alternatives. Invalidation decisions retain old state and exact rejection reasons. Final plan decisions include backtracking/propagation statistics, preserved/invalidated counts and local-search cost changes. Explanations are stored at decision time; later world changes do not rewrite old evidence.
