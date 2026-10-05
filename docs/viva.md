# Presentation / viva notes

**Why a graph?** Intersections are nodes and roads are edges with traversal cost. Graph structure makes route validity and road closure explicit, reusable and testable. The rendered roads are those same edges.

**Why A*?** It combines accumulated cost with an admissible estimate of remaining cost. With this heuristic it preserves UCS's minimum-cost result while often exploring fewer nodes. BFS alone ignores weighted travel and risk.

**Why implement other searches?** They demonstrate different frontier policies and tradeoffs. The API and search laboratory exercise the real implementations rather than forcing all algorithms into emergency routing.

**Why CSP?** Independent nearest-vehicle selection can double-book resources or the same ICU bed. Joint assignment variables and global constraints establish a feasible allocation under scarcity.

**Why backtracking?** An early feasible-looking choice can leave another task with no resource. The solver must retract choices and explore alternatives, demonstrated by an adversarial test.

**Why propagation?** Forward checking removes values already incompatible with the partial allocation, reducing futile search. It accounts for resource uniqueness and cumulative hospital capacity. We do not claim full arc consistency.

**Why logic?** Response requirements can arise through implications. For example, crowded fire → evacuation → rescue. Proof traces show how facts produced actions, instead of hiding priority in unexplained UI labels.

**Why dynamic replanning?** A valid plan can become invalid after road, hospital, resource or incident changes. Validating and repairing affected assignments preserves stable useful work while reacting to new constraints.

**Why local search after CSP?** Feasibility and quality are separate concerns. CSP finds a priority-respecting feasible service set; hill climbing improves its route cost while maintaining all constraints. Pair exchanges can improve assignments that single changes cannot.

**Why online search?** The agent may not know a road's physical status before sensing it. Discovering the next edge and replanning demonstrates acting with partial information. This implementation is sense–update–replan, not LRTA*.

**Why 3D?** It makes resource movement, different facilities, physical routes and changed road conditions visible. 3D improves demonstration and inspection; it is not the source of intelligence.

**How is scarcity handled?** Domains filter incompatible resources and unsuitable hospitals, cumulative constraints reserve beds and ICU, and lexicographic priorities select service coverage. Deferred tasks remain visible with failure reasons. Lower-priority active responses can be preempted when that enables feasible urgent service.

**Does it always find the globally best allocation?** No. Search is bounded, preserved plans constrain incremental optimization, and hill climbing can reach a local minimum. Budget exhaustion and optimization statistics are reported. A* itself is optimal for the current known graph and stated edge cost model.

**Is it machine learning?** No. There is no training, model inference or external AI API in decision making. All decisions are reproducible from explicit facts, rules, search and constraints.

**What is simplified?** Time scales, triage deadlines, the road grid, service actions, single-patient transport, and hospital occupancy dynamics. Real emergency systems would need validated protocols, communications, operational safeguards, richer uncertainty models and human oversight.
