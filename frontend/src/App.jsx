import { useEffect, useState } from 'react'
import City3D from './components/City3D'
import Explanation from './components/Explanation'
import EventControls from './components/EventControls'
import { useSimulation } from './state/simulationStore'

const time = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`

export default function App() {
  const { world, refresh, act, busy, error, clearError, selectedRoad, selectedIncident, selectIncident, explain } = useSimulation()
  const [tab, setTab] = useState('Operations')
  useEffect(() => { refresh(); const timer = setInterval(refresh, 500); return () => clearInterval(timer) }, [refresh])
  if (!world) return <main className="loading"><div className="brand">RESQ<span>—X</span></div><h1>Connecting to command center</h1><p>{error || 'Loading city and simulation state…'}</p><button onClick={refresh}>Retry connection</button><code>Start backend: uvicorn backend.main:app --reload</code></main>
  const incidents = Object.values(world.incidents)
  const active = incidents.filter(i => i.status !== 'RESOLVED')
  const resources = Object.values(world.resources)
  const available = resources.filter(r => r.available && r.status === 'IDLE').length
  const decisions = [...world.decisions].reverse()
  const selected = world.incidents[selectedIncident]
  return <div className="app-shell">
    <header className="topbar"><div className="identity"><div className="brand">RESQ<span>—X</span></div><div className="identity-divider" /><div className="subtitle">EMERGENCY OPERATIONS<br /><span>Dynamic crisis response simulator</span></div></div>
      <div className="top-status"><span className={`status-dot ${world.running ? 'live' : ''}`} />{world.running ? 'SIMULATION LIVE' : 'SIMULATION PAUSED'}<span className="clock">T+ {time(world.time)}</span><span className="version">LOCAL / 01</span></div>
    </header>
    <div className="toolbar"><div><span className="eyebrow">EASTBANK DISTRICT</span><h1>Command center <span>/ Live overview</span></h1></div><div className="button-row">
      <button disabled={busy} onClick={() => act(`/simulation/${world.running ? 'pause' : 'start'}`)}>{world.running ? 'Ⅱ Pause' : '▶ Start'}</button><button disabled={busy || world.running} onClick={() => act('/simulation/step')}>Step</button><button disabled={busy} onClick={() => { selectIncident(null); act('/simulation/reset') }}>Reset</button><button className="primary" disabled={busy} onClick={() => { selectIncident(null); act('/simulation/demo') }}>Run guided demo ↗</button>
    </div></div>
    {error && <div className="error-banner" role="alert">{error}<button onClick={clearError}>Dismiss</button></div>}
    <main className="workspace"><section className="map-column">
      <div className="metrics"><div><span>ACTIVE INCIDENTS</span><strong className={active.length ? 'coral' : ''}>{String(active.length).padStart(2, '0')}</strong></div><div><span>RESOURCES READY</span><strong>{String(available).padStart(2, '0')}<small> / {resources.length}</small></strong></div><div><span>ACTIVE ASSIGNMENTS</span><strong>{String(world.plan.assignments.length).padStart(2, '0')}</strong></div><div><span>AWAITING ALLOCATION</span><strong className={Object.keys(world.plan.unassigned).length ? 'amber' : ''}>{String(Object.keys(world.plan.unassigned).length).padStart(2, '0')}</strong></div></div>
      <div className="map-container"><City3D world={world} />
        <div className="map-top"><span><i className="status-dot live" /> CITY DIGITAL TWIN</span><span>25 NODES / 40 ROADS</span></div>
        {!incidents.length && <div className="map-intro"><span className="eyebrow">SYSTEM READY</span><h2>Every second.<br />Every decision.</h2><p>Launch a factory emergency and watch the agent<br />reason, allocate, route, and replan.</p><button className="primary" disabled={busy} onClick={() => act('/simulation/demo')}>Launch demonstration →</button></div>}
        <div className="map-bottom"><span>Drag to orbit · Scroll to zoom · Click a road</span><span className="mono">{selectedRoad}</span></div>
        <div className="map-legend"><span><i style={{ background: '#68b7ff' }} />Medical</span><span><i style={{ background: '#f07861' }} />Fire</span><span><i style={{ background: '#e6c36a' }} />Rescue</span><span><i style={{ background: '#713d39' }} />Blocked</span></div>
      </div>
      <div className="agent-strip"><div><span className="status-dot live" /><strong>{world.ai_status}</strong><span>Plan revision {world.plan.revision}</span></div><button disabled={busy} onClick={() => act('/replan')}>Revalidate & replan ↻</button></div>
      <section className="decision-panel"><div className="section-heading"><div><span className="eyebrow">REASONING TRACE</span><h2>Decision log</h2></div><span className="muted">Actual backend decisions · click WHY to inspect</span></div>
        <div className="decision-list">{decisions.length ? decisions.map(d => <div className="decision-row" key={d.id}><time>{time(d.timestamp)}</time><span className={`log-stage ${d.stage === 'REPLANNING' ? 'amber' : ''}`}>{d.algorithm}</span><span>{d.summary}</span><button onClick={() => explain(d.id)}>WHY ↗</button></div>) : <div className="empty">No decisions yet. Create an emergency or launch the guided demo.</div>}</div>
      </section>
    </section>
    <aside className="sidebar"><nav className="tabs">{['Operations', 'Inject events'].map(t => <button className={tab === t ? 'active' : ''} key={t} onClick={() => setTab(t)}>{t}</button>)}</nav>
      <div className="sidebar-scroll">{tab === 'Inject events' ? <EventControls world={world} /> : <>
        {world.demo_active && <div className="demo-progress"><span className="eyebrow">GUIDED SCENARIO · {world.demo_step}/5</span><strong>{['', 'Factory fire · response dispatched', 'Road blocked · route repaired', 'ICU reduced · assignment reviewed', 'School accident · resources compete', 'Unknown road · online discovery'][world.demo_step]}</strong><p>Events at T+00, 04, 09, 14 and 19 seconds.</p></div>}
        <section><div className="section-heading"><h2>Incidents</h2><span className="count">{active.length} active</span></div>
          {incidents.length ? incidents.map(i => <button className={`incident-card ${selectedIncident === i.id ? 'selected' : ''}`} key={i.id} onClick={() => selectIncident(selectedIncident === i.id ? null : i.id)}><div><span className={`priority p${i.priority}`}>P{i.priority}</span><strong>{i.type.replace('_', ' ')}</strong><span className="muted">{i.location}</span></div><p>{i.id}</p><div className="incident-meta"><span>{i.affected_population} affected</span><span>{i.status}</span></div></button>) : <p className="empty compact">No active emergencies.<br />The district is standing by.</p>}
          {selected && <div className="selection-detail"><strong>{selected.id}</strong><p>Severity {selected.severity} / 5 · {selected.assigned_resources.length} assigned</p><button disabled={busy || selected.status === 'RESOLVED'} onClick={() => act('/events/incident-change', { incident_id: selected.id, severity: Math.min(5, selected.severity + 1), affected_population: selected.affected_population + 20 })}>Escalate severity & population</button><button onClick={() => selectIncident(null)}>Show all routes</button></div>}
        </section>
        <section><div className="section-heading"><h2>Response resources</h2><span className="count">{resources.length} total</span></div>{resources.map(r => <div className="resource-row" key={r.id}><span className={`resource-icon ${r.type.toLowerCase()}`}>{r.type === 'AMBULANCE' ? '+' : r.type === 'FIRE_TRUCK' ? 'F' : 'R'}</span><div><strong>{r.id}</strong><small>{r.assigned_incident || (r.available ? `Standby · ${r.location}` : 'Out of service')}</small></div><span className={`resource-state ${r.status === 'IDLE' ? 'green' : ''}`}>{r.status.replace('_', ' ')}</span></div>)}</section>
        <section><div className="section-heading"><h2>Hospital network</h2><span className="count">LIVE CAPACITY</span></div>{Object.values(world.hospitals).map(h => {
          const reserved = world.plan.assignments.filter(a => a.hospital_id === h.id)
          const icu = reserved.filter(a => world.patients[a.patient_id]?.critical).length
          return <div className="hospital-card" key={h.id}><div className="section-heading"><strong>{h.name}</strong><span className={h.available ? 'green' : 'coral'}>{h.available ? 'ONLINE' : 'OFFLINE'}</span></div><div className="capacity-label"><span>Beds</span><span>{h.occupied_beds} occupied + {reserved.length} reserved / {h.total_beds}</span></div><div className="capacity-track"><i style={{ width: `${100 * h.occupied_beds / Math.max(1, h.total_beds)}%` }} /><b style={{ width: `${100 * reserved.length / Math.max(1, h.total_beds)}%` }} /></div><div className="capacity-label"><span>ICU available</span><strong className="blue">{h.icu_beds - h.occupied_icu - icu} / {h.icu_beds}</strong></div></div>
        })}</section>
        {Object.keys(world.plan.unassigned).length > 0 && <section><h2 className="amber">Pending tasks</h2>{Object.entries(world.plan.unassigned).map(([id, reason]) => <details className="pending" key={id}><summary>{id}</summary><p>{reason}</p></details>)}</section>}
      </>}</div>
    </aside></main>
    <footer><span>RESQ-X / CLASSICAL AI DECISION SUPPORT</span><span>Simulated environment · Not for real emergency deployment</span><span>A* · CSP · LOGIC · REPLANNING</span></footer>
    <Explanation />
  </div>
}
