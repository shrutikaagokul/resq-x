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
  const { world, refresh, act, busy, error, clearError, clearSelection, explain } = useSimulation()
  const [dialog, setDialog] = useState(null)
  const closeDialog = useCallback(() => setDialog(null), [])
  const inspectInCity = useCallback(() => {
    setDialog(null)
    document.querySelector('.map-container')?.scrollIntoView({ block: 'start' })
  }, [])
  useEffect(() => { refresh(); const timer = setInterval(refresh, 500); return () => clearInterval(timer) }, [refresh])
  if (!world) return <main className="loading"><div className="brand">RESQ-X</div><h1>Connecting to command center</h1><p>{error || 'Loading city and simulation state…'}</p><button onClick={refresh}>Retry connection</button><code>Start backend: uvicorn backend.main:app --reload</code></main>
  const incidents = Object.values(world.incidents)
  const resources = Object.values(world.resources)
  const active = incidents.filter(i => i.status !== 'RESOLVED').length
  const available = resources.filter(r => r.available && r.status === 'IDLE').length
  const responding = resources.filter(r => ['RESPONDING', 'ON_SCENE', 'TRANSPORTING'].includes(r.status)).length
  const decisions = [...world.decisions].reverse()
  function reset(action) { clearSelection(); act(`/simulation/${action}`) }
  return <div className="app-shell">
    <header className="topbar">
      <div className="identity"><h1 className="brand">RESQ-X</h1><span className="subtitle">Dynamic Crisis Response</span></div>
      <div className="top-status"><span className={`status-dot ${world.running ? 'live' : ''}`} /><span>{world.running ? 'LIVE' : 'PAUSED'}</span><span className="clock">T+ {time(world.time)}</span></div>
    </header>
    {error && <div className="error-banner" role="alert">{error}<button onClick={clearError}>Dismiss</button></div>}
    <main>
      <section className="map-container" aria-label="City simulator">
        <City3D world={world} />
        <div className="map-heading"><span className="eyebrow">Eastbank district</span><h2>A city in motion.</h2><p>{Object.keys(world.nodes).length} intersections · {Object.keys(world.roads).length} roads</p></div>
        <EntityDetails world={world} />
        <div className="map-bottom"><span>Drag to orbit · Scroll to zoom · Select an entity to inspect</span><div className="map-legend"><span><i className="medical" />Medical</span><span><i className="fire" />Fire</span><span><i className="rescue" />Rescue</span><span><i className="blocked" />Blocked</span></div></div>
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
          <button className="text-button" onClick={() => setDialog('operations')}>Incidents & resources ↗</button>
        </section>
        <div className="agent-strip"><div><span className="eyebrow">{world.ai_status.toLowerCase()}</span><span className="muted">Plan {world.plan.revision}</span></div><button className="text-button" disabled={busy} onClick={() => act('/replan')}>Revalidate & replan</button></div>
        {world.demo_active ? <p className="demo-progress"><span className="eyebrow">Guided scenario {world.demo_step}/5</span>{demoStages[world.demo_step]}<span className="muted">Events at 00, 04, 09, 14 and 19 seconds.</span></p> : !incidents.length && <p className="intro-note">The district is standing by. Run the guided demo to watch the agent reason, allocate, and replan.</p>}
        <details className="decision-panel">
          <summary><span>Decision log</span><span className="muted">{decisions.length ? `${decisions.length} recent decisions · inspect the reasoning` : 'Decisions will appear as the simulation runs'}</span></summary>
          <div className="decision-list">{decisions.length ? decisions.map(d => <div className="decision-row" key={d.id}><time>{time(d.timestamp)}</time><span className={`log-stage ${d.stage === 'REPLANNING' ? 'amber' : ''}`}>{d.algorithm}</span><span>{d.summary}</span><button onClick={() => explain(d.id)}>WHY ↗</button></div>) : <p className="empty">No decisions yet. Create an emergency or launch the guided demo.</p>}</div>
        </details>
      </div>
    </main>
    <footer><span>RESQ-X · Classical AI decision support</span><span>Simulated environment · Not for real emergency deployment</span></footer>
    {dialog && <Dialog title={dialog === 'events' ? 'Inject event' : 'Incidents & resources'} onClose={closeDialog}>
      {error && <p className="critical" role="alert">{error}</p>}
      {dialog === 'events' ? <EventControls world={world} /> : <Operations world={world} onSelect={inspectInCity} />}
    </Dialog>}
    <Explanation />
  </div>
}
