import { useCallback, useEffect, useState } from 'react'
import City3D from './components/City3D'
import Explanation from './components/Explanation'
import EventControls from './components/EventControls'
import EntityDetails from './components/EntityDetails'
import Operations from './components/Operations'
import Dialog from './components/Dialog'
import { useSimulation } from './state/simulationStore'

const time = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
const demoStages = ['', 'Factory fire · response dispatched', 'Road blocked · route repaired', 'ICU reduced · assignment reviewed', 'School accident · resources compete', 'Unknown road · online discovery']

export default function App() {
  const { world, refresh, act, busy, error, clearError, clearSelection, explain, selectEntity } = useSimulation()
  const [dialog, setDialog] = useState(null)
  const [dismissedCriticals, setDismissedCriticals] = useState(new Set())
  const [dismissedResolved, setDismissedResolved] = useState(new Set())
  const closeDialog = useCallback(() => setDialog(null), [])
  const inspectInCity = useCallback(() => {
    setDialog(null)
    document.querySelector('.map-container')?.scrollIntoView({ block: 'start' })
  }, [])
  useEffect(() => { refresh(); const timer = setInterval(refresh, 500); return () => clearInterval(timer) }, [refresh])

  if (!world) return <main className="loading"><div className="brand">RESQ-X</div><h1>Connecting to command center</h1><p>{error || 'Loading city and simulation state…'}</p><button onClick={refresh}>Retry connection</button><code>Start backend: uvicorn backend.main:app --reload</code></main>

  const incidents  = Object.values(world.incidents)
  const resources  = Object.values(world.resources)
  const active     = incidents.filter(i => i.status !== 'RESOLVED').length
  const available  = resources.filter(r => r.available && r.status === 'IDLE').length
  const responding = resources.filter(r => ['RESPONDING', 'ON_SCENE', 'TRANSPORTING'].includes(r.status)).length
  const decisions  = [...world.decisions].reverse()
  function reset(action) { clearSelection(); act(`/simulation/${action}`) }

  // Collect patient_condition_change events for CRITICAL escalations in the last 5 simulation seconds
  const criticalAlerts = world.events.filter(
    e => e.type === 'patient_condition_change'
      && e.payload?.new_condition === 'CRITICAL'
      && world.time - e.timestamp <= 5
      && !dismissedCriticals.has(e.payload?.patient_id)
  )

  // Collect incident_resolved events in the last 12 simulation seconds
  const resolvedAlerts = world.events.filter(
    e => e.type === 'incident_resolved'
      && world.time - e.timestamp <= 12
      && !dismissedResolved.has(e.payload?.incident_id)
  )

  return <div className="app-shell">
    <header className="topbar">
      <div className="identity"><h1 className="brand">RESQ-X</h1><span className="subtitle">Dynamic Crisis Response</span></div>
      <div className="top-status"><span className={`status-dot ${world.running ? 'live' : ''}`} /><span>{world.running ? 'LIVE' : 'PAUSED'}</span><span className="clock">T+ {time(world.time)}</span></div>
    </header>
    {error && <div className="error-banner" role="alert">{error}<button onClick={clearError}>Dismiss</button></div>}
    {criticalAlerts.map(e => (
      <div key={e.payload.patient_id} className="critical-alert" role="alert">
        <span>⚠ Patient <strong>{e.payload.patient_id}</strong> condition escalated to <strong>CRITICAL</strong> — ICU required</span>
        <button
          aria-label="Dismiss critical alert"
          onClick={() => setDismissedCriticals(prev => new Set([...prev, e.payload.patient_id]))}
        >
          Dismiss
        </button>
      </div>
    ))}
    {resolvedAlerts.map(e => {
      const p = e.payload
      const durationStr = p.duration != null ? `${p.duration}s` : `${(world.time - (p.created_at || world.time)).toFixed(1)}s`
      return (
        <div key={p.incident_id} className="resolved-alert" role="alert">
          <div className="resolved-alert-content">
            <span className="resolved-check">✓</span>
            <div>
              <strong>Incident {p.incident_id} ({p.type}) RESOLVED</strong>
              <span className="resolved-metrics">
                Response time: {durationStr}
                {p.tasks_completed != null && ` · ${p.tasks_completed} task${p.tasks_completed > 1 ? 's' : ''} completed`}
                {p.patients_admitted != null && p.patients_admitted > 0 && ` · ${p.patients_admitted} patient${p.patients_admitted > 1 ? 's' : ''} admitted`}
              </span>
            </div>
          </div>
          <div className="alert-actions">
            <button
              className="alert-inspect-btn"
              onClick={() => {
                selectEntity('incident', p.incident_id)
                document.querySelector('.map-container')?.scrollIntoView({ block: 'start' })
              }}
            >
              Inspect ↗
            </button>
            <button
              aria-label="Dismiss resolution alert"
              onClick={() => setDismissedResolved(prev => new Set([...prev, p.incident_id]))}
            >
              Dismiss
            </button>
          </div>
        </div>
      )
    })}
    <main>
      <section className="map-container" aria-label="City simulator">
        <City3D world={world} />
        <div className="map-heading"><span className="eyebrow">Eastbank district</span><h2>A city in motion.</h2><p>{Object.keys(world.nodes).length} intersections · {Object.keys(world.roads).length} roads</p></div>
        <EntityDetails world={world} />
        <div className="map-bottom">
          <span className="map-hint">Drag to orbit · Scroll to zoom · Select an entity to inspect</span>
          <div className="map-legend" role="region" aria-label="Map color legend">
            <span className="legend-group-title">Vehicles:</span>
            <span><i className="medical" />Medical</span>
            <span><i className="fire" />Fire</span>
            <span><i className="rescue" />Rescue</span>
            <span><i className="blocked" />Blocked</span>
            <span className="legend-sep" />
            <span className="legend-group-title">Traffic:</span>
            <span><i className="traf-low" />Low</span>
            <span><i className="traf-moderate" />Mod</span>
            <span><i className="traf-heavy" />Heavy</span>
            <span><i className="traf-gridlock" />Gridlock</span>
          </div>
        </div>
      </section>
      <div className="simulation-desk">
        <section className="statistics-strip" aria-label="Simulation statistics">
          <div><span>Active incidents</span><strong className={active ? 'critical' : ''}>{active}</strong></div>
          <div><span>Resources available</span><strong>{available}<small> / {resources.length}</small></strong></div>
          <div><span>Resources responding</span><strong>{responding}</strong></div>
          <div><span>Pending tasks</span><strong className={Object.keys(world.plan.unassigned).length ? 'amber' : ''}>{Object.keys(world.plan.unassigned).length}</strong></div>
        </section>
        <section className="simulation-controls" aria-label="Simulation controls">
          <div className="button-row"><button className="primary" disabled={busy} onClick={() => act(`/simulation/${world.running ? 'pause' : 'start'}`)}>{world.running ? 'Pause' : 'Start'}</button><button disabled={busy || world.running} onClick={() => act('/simulation/step')}>Step</button><button disabled={busy} onClick={() => reset('demo')}>Run guided demo</button><button onClick={() => setDialog('events')}>Inject event</button><button className="text-button" disabled={busy} onClick={() => reset('reset')}>Reset</button></div>
          <button className="text-button" onClick={() => setDialog('operations')}>Incidents &amp; resources ↗</button>
        </section>
        <div className="agent-strip"><div><span className="eyebrow">{world.ai_status.toLowerCase()}</span><span className="muted">Plan {world.plan.revision}</span></div><button className="text-button" disabled={busy} onClick={() => act('/replan')}>Revalidate &amp; replan</button></div>
        {world.demo_active ? <p className="demo-progress"><span className="eyebrow">Guided scenario {world.demo_step}/5</span>{demoStages[world.demo_step]}<span className="muted">Events at 00, 04, 09, 14 and 19 seconds.</span></p> : !incidents.length && <p className="intro-note">The district is standing by. Run the guided demo to watch the agent reason, allocate, and replan.</p>}
        <details className="decision-panel">
          <summary><span>Decision log</span><span className="muted">{decisions.length ? `${decisions.length} recent decisions · inspect the reasoning` : 'Decisions will appear as the simulation runs'}</span></summary>
          <div className="decision-list">{decisions.length ? decisions.map(d => <div className="decision-row" key={d.id}><time>{time(d.timestamp)}</time><span className={`log-stage ${d.stage === 'REPLANNING' ? 'amber' : ''}`}>{d.algorithm}</span><span>{d.summary}{d.evidence?.previous_condition && d.evidence?.new_condition && <span className="condition-transition-tag" style={{ marginLeft: '8px', display: 'inline-flex', gap: '4px', alignItems: 'center' }}><span className={`condition-badge condition-badge--${d.evidence.previous_condition.toLowerCase()}`}>{d.evidence.previous_condition}</span><span>→</span><span className={`condition-badge condition-badge--${d.evidence.new_condition.toLowerCase()}`}>{d.evidence.new_condition}</span></span>}</span><button onClick={() => explain(d.id)}>WHY ↗</button></div>) : <p className="empty">No decisions yet. Create an emergency or launch the guided demo.</p>}</div>
        </details>
      </div>
    </main>
    <footer><span>RESQ-X · Classical AI decision support</span><span>Simulated environment · Not for real emergency deployment</span></footer>
    {dialog && <Dialog title={dialog === 'events' ? 'Inject event' : 'Operations & Resources'} onClose={closeDialog}>
      {error && <p className="critical" role="alert">{error}</p>}
      {dialog === 'events' ? <EventControls world={world} /> : <Operations world={world} onSelect={inspectInCity} />}
    </Dialog>}
    <Explanation />
  </div>
}
