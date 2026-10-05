# Demonstration guide

## Before presenting

Start the backend and frontend using the README. Open the command center and API documentation. Reset the city. Initially five of seven vehicles are ready; one ambulance and one fire truck are in maintenance. Two hospitals each have one free ICU slot. All data is synthetic.

## Main demonstration (about two minutes)

1. Click **Run guided demo**. Four resources respond to the factory emergency. Explain the rule chain: fire plus 80 affected people implies evacuation, evacuation implies a rescue team, severe crowded incident implies critical priority.
2. At **T+04**, pause. A road is visibly barricaded. Scroll the decision log to `PlanValidator`, click WHY, and show the old route and invalidation reason. Compare it to the replacement A* path. Unaffected assignments keep their IDs and reservations.
3. Resume until **T+09**, then pause. Central Medical's free ICU bed disappears. The allocator cannot fit both critical patients in the remaining capacity. Show the pending task explanation; a truthful inability to allocate is part of the demonstration.
4. Resume until **T+14**. A school accident introduces a third patient and another rescue task. The freed ambulance can serve the noncritical patient using a standard bed; the waiting critical patient cannot be assigned to a standard bed.
5. At **T+19**, the next route edge of a resource contains a hidden blockage. Online observation discovers it before traversal, records `road_discovered`, and repairs its affected plan. This simulates partial observability; it does not claim real sensors.
6. Click WHY on a `CSP + A*` assignment. Show facts, rule provenance, candidate count, capacity constraints, hospital choice, route cost and explored nodes. Expand full evidence for the underlying JSON.
7. In **Inject events**, choose the unavailable hospital/ICU change, add one ICU bed before T+120, and show the waiting critical task become feasible. Let vehicles complete their routes; service is represented by six seconds on scene. Hospital occupancy increases on admission and the ambulance becomes ready for another task.

The next injected road is selected from the actual current route, so the scenario remains coherent with previous replans. Pause and step are useful for repeatable inspection.

## Additional experiments

- **Resource failure:** fail AMB-01 while assigned. Show its FAILED state, the released reservation, and reassignment or explicit shortage. Restore AMB-03 from maintenance to add supply.
- **Priority preemption:** reset; fail AMB-02; create a severity-1 noncritical medical emergency; then create severity-5 critical medical work before the first ambulance reaches the incident. The lower-priority response can be released when doing so makes the urgent task feasible.
- **Unreachable destination:** click and block roads around a chosen node. Create an incident at that node; the pending explanation lists unreachable response routes. Reopen a road to restore feasibility.
- **Search comparison:** use the search laboratory with several destinations and blockages. BFS minimizes hop count; UCS/A* minimize weighted route cost; Greedy/DFS are comparison algorithms.
- **Hospital closure during transport:** wait for an ambulance to become TRANSPORTING, make its target hospital unavailable, and inspect the new route. A functioning ambulance retains its patient when another suitable hospital is feasible.
- **Restart/persistence:** pause, restart the backend, and refresh. The same world and decisions restore paused from SQLite.

## Reading the display

Blue routes represent ambulances, coral routes fire trucks, gold routes rescue teams. Dashed blue routes are planned patient transport legs. Muted vehicles are unavailable. Orange barricades reflect known graph blockages. A road with unknown status has a yellow dashed centerline. Vehicle locations and routes come from the backend; the browser only interpolates movement.

Priority badges are `P1`–`P5`, with `P5` most urgent. Occupied beds and reserved beds are separate segments; available ICU excludes reservations. Selecting an incident filters route overlays. WHY entries are historical decision snapshots, not explanations regenerated from a later state.
