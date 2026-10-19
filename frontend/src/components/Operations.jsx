import { useSimulation } from '../state/simulationStore'

export default function Operations({ world, onSelect }) {
  const { selectEntity } = useSimulation()
  function inspect(kind, id) { selectEntity(kind, id); onSelect() }
  return <div className="operations">
    <p className="muted">Select an entry to inspect it in the city. These lists include inactive resources and resolved incidents.</p>
    <section><h3>Incidents</h3>{Object.values(world.incidents).length ? Object.values(world.incidents).map(i =>
      <button className="directory-row" key={i.id} onClick={() => inspect('incident', i.id)}><span><strong>{i.id}</strong><small>{i.type} · {i.affected_population} affected · P{i.priority}</small></span><span>{i.status}</span></button>
    ) : <p className="empty">No incidents. Start a guided demo or inject an event.</p>}</section>
    <section><h3>Response resources</h3>{Object.values(world.resources).map(r => <button className="directory-row" key={r.id} onClick={() => inspect('vehicle', r.id)}>
      <span><strong>{r.id}</strong><small>{r.type.replaceAll('_', ' ')} · {r.assigned_incident || r.location}</small></span><span className={r.status === 'IDLE' ? 'green' : ''}>{r.status.replaceAll('_', ' ')}</span>
    </button>)}</section>
    <section><h3>Hospital network</h3>{Object.values(world.hospitals).map(h => <button className="directory-row" key={h.id} onClick={() => inspect('hospital', h.id)}><span><strong>{h.name}</strong><small>{h.occupied_beds} / {h.total_beds} beds occupied</small></span><span className={h.available ? 'green' : 'critical'}>{h.available ? 'Available' : 'Unavailable'}</span></button>)}</section>
    <section><h3>Roads</h3><div className="road-directory">{Object.values(world.roads).map(r => <button key={r.id} className={r.blocked ? 'critical' : ''} onClick={() => inspect('road', r.id)}>{r.id}{r.blocked ? ' · Blocked' : !r.known ? ' · Unknown' : ''}</button>)}</div></section>
    <section><h3>Pending tasks</h3>{Object.entries(world.plan.unassigned).length ? Object.entries(world.plan.unassigned).map(([id, reason]) => <details className="pending" key={id}><summary>{id}</summary><p>{reason}</p></details>) : <p className="empty">No pending tasks.</p>}</section>
  </div>
}
