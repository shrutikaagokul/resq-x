import { useEffect } from 'react'
import { useSimulation } from '../state/simulationStore'

export default function Explanation() {
  const { explanation: d, closeExplanation } = useSimulation()
  useEffect(() => {
    const handler = event => { if (event.key === 'Escape') closeExplanation() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [closeExplanation])
  if (!d) return null
  const e = d.evidence, a = e.assignment
  return <div className="modal-backdrop" onClick={closeExplanation}><section className="modal explanation" role="dialog" aria-modal="true" aria-label="Decision explanation" onClick={event => event.stopPropagation()}>
    <div className="section-heading"><span className="eyebrow">DECISION / {d.id}</span><button onClick={closeExplanation} autoFocus aria-label="Close explanation">Close ×</button></div>
    <h2>{d.summary}</h2><p className="muted">{d.algorithm} · simulation time {d.timestamp.toFixed(1)}s</p>
    {a && <><h3>Selected assignment</h3><div className="explanation-route">{a.resource_id} → {a.incident_id}{a.hospital_id && ` → ${a.hospital_id}`}</div>
      <p>Priority {a.priority} · deadline {a.deadline}s · {e.domain_size} feasible candidate options before joint allocation</p>
      <h3>A* response route</h3><p className="mono">{a.response_route.path.join(' → ')}</p><p className="muted">Cost {a.response_route.cost} · travel {a.response_route.travel_time}s · {a.response_route.explored.length} explored nodes</p>
      {a.transport_route && <><h3>Patient transport</h3><p className="mono">{a.transport_route.path.join(' → ')}</p></>}
    </>}
    {e.rules?.length > 0 && <><h3>Facts and inference</h3>{e.rules.map((r, i) => <div className="proof" key={i}><code>{r.predicate}({r.subject}, {String(r.value)})</code><small>{r.rule}</small>{r.premises.length > 0 && <small>Because: {r.premises.join(' ∧ ')}</small>}</div>)}</>}
    {e.constraints && <><h3>Enforced constraints</h3><div className="tags">{e.constraints.map(c => <span key={c}>{c}</span>)}</div></>}
    {(e.reasons || e.rejected_alternatives)?.length > 0 && <><h3>{e.reasons ? 'Why the plan changed / could not be assigned' : 'Rejected alternatives'}</h3><ul>{(e.reasons || e.rejected_alternatives).map((r, i) => <li key={i}>{r}</li>)}</ul></>}
    <details><summary>Full recorded algorithm evidence</summary><pre>{JSON.stringify(e, null, 2)}</pre></details>
  </section></div>
}
