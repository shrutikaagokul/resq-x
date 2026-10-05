import { useState } from 'react'
import { useSimulation } from '../state/simulationStore'
import { api } from '../services/api'

export default function EventControls({ world }) {
  const { act, busy, selectedRoad, selectRoad } = useSimulation()
  const [type, setType] = useState('MEDICAL')
  const [location, setLocation] = useState('N12')
  const [severity, setSeverity] = useState(4)
  const [population, setPopulation] = useState(12)
  const [patients, setPatients] = useState(1)
  const [critical, setCritical] = useState(0)
  const [hospital, setHospital] = useState('H1')
  const [resource, setResource] = useState('AMB-01')
  const [searches, setSearches] = useState(null)
  const [searchError, setSearchError] = useState(null)
  const [comparing, setComparing] = useState(false)
  const h = world.hospitals[hospital]
  async function compare() {
    setComparing(true)
    setSearchError(null)
    try { setSearches(await Promise.all(['BFS', 'DFS', 'UCS', 'Greedy', 'A*'].map(a => api(`/search?start=N00&goal=${location}&algorithm=${encodeURIComponent(a)}`)))) }
    catch (error) { setSearchError(error.message) }
    finally { setComparing(false) }
  }
  return <div className="event-controls">
    <p className="muted">Inject a change. The backend validates active plans and repairs affected assignments.</p>
    <fieldset disabled={busy}><legend>New emergency</legend>
      <div className="form-grid"><label>Type<select value={type} onChange={e => setType(e.target.value)}>{['MEDICAL', 'FIRE', 'ACCIDENT', 'FLOOD', 'INDUSTRIAL', 'EVACUATION'].map(t => <option key={t}>{t}</option>)}</select></label>
        <label>Location<select value={location} onChange={e => setLocation(e.target.value)}>{Object.keys(world.nodes).map(n => <option key={n}>{n}</option>)}</select></label>
        <label>Severity<input type="number" min="1" max="5" value={severity} onChange={e => setSeverity(+e.target.value)} /></label>
        <label>Population<input type="number" min="1" max="10000" value={population} onChange={e => setPopulation(+e.target.value)} /></label>
        <label>Patients<input type="number" min="0" max="12" value={patients} onChange={e => setPatients(+e.target.value)} /></label>
        <label>Critical<input type="number" min="0" max="12" value={critical} onChange={e => setCritical(+e.target.value)} /></label></div>
      <button className="wide primary" onClick={() => act('/incidents', { type, location, severity, affected_population: population, patients, critical_patients: critical })}>Create emergency</button>
    </fieldset>
    <fieldset disabled={busy}><legend>Road conditions</legend><label>Road · or click in city<select value={selectedRoad} onChange={e => selectRoad(e.target.value)}>{Object.values(world.roads).map(r => <option key={r.id} value={r.id}>{r.id}{r.blocked ? ' · BLOCKED' : !r.known ? ' · UNKNOWN' : ''}</option>)}</select></label>
      <div className="button-row"><button onClick={() => act('/events/road-block', { road_id: selectedRoad })}>Block</button><button onClick={() => act('/events/road-reopen', { road_id: selectedRoad })}>Reopen</button><button title="Hide a blockage until a vehicle observes this road" onClick={() => act('/events/road-unknown', { road_id: selectedRoad })}>Hide blockage</button></div>
    </fieldset>
    <fieldset disabled={busy}><legend>Hospital capacity</legend><label>Hospital<select value={hospital} onChange={e => setHospital(e.target.value)}>{Object.values(world.hospitals).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
      <div className="button-row"><button onClick={() => act('/events/hospital-change', { hospital_id: hospital, icu_beds: h.occupied_icu })}>Remove free ICU</button><button onClick={() => act('/events/hospital-change', { hospital_id: hospital, icu_beds: Math.min(h.total_beds, h.icu_beds + 1) })}>+1 ICU bed</button></div>
      <button className="wide" onClick={() => act('/events/hospital-change', { hospital_id: hospital, available: !h.available })}>{h.available ? 'Make hospital unavailable' : 'Restore hospital'}</button>
    </fieldset>
    <fieldset disabled={busy}><legend>Vehicle availability</legend><label>Resource<select value={resource} onChange={e => setResource(e.target.value)}>{Object.keys(world.resources).map(r => <option key={r}>{r}</option>)}</select></label><div className="button-row"><button onClick={() => act('/events/vehicle-failure', { resource_id: resource })}>Fail vehicle</button><button onClick={() => act('/events/vehicle-restore', { resource_id: resource })}>Restore</button></div></fieldset>
    <fieldset><legend>Search laboratory</legend><p className="muted">N00 → {location}, using current known roads.</p><button className="wide" disabled={comparing} onClick={compare}>{comparing ? 'Searching…' : 'Compare search algorithms'}</button>
      {searchError && <p role="alert">{searchError}</p>}
      {searches && <table><thead><tr><th>Search</th><th>Cost</th><th>Explored</th></tr></thead><tbody>{searches.map(r => <tr key={r.algorithm}><td>{r.algorithm}</td><td>{r.reachable ? r.cost : 'No route'}</td><td>{r.explored.length}</td></tr>)}</tbody></table>}
    </fieldset>
  </div>
}
