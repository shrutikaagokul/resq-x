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
  const currentRoad = world.roads[selectedRoad]

  async function compare() {
    setComparing(true)
    setSearchError(null)
    try {
      setSearches(
        await Promise.all(
          ['BFS', 'DFS', 'UCS', 'Greedy', 'A*'].map(a =>
            api(`/search?start=N00&goal=${location}&algorithm=${encodeURIComponent(a)}`)
          )
        )
      )
    } catch (error) {
      setSearchError(error.message)
    } finally {
      setComparing(false)
    }
  }

  return (
    <div className="event-controls">
      <p className="muted">
        Inject dynamic disruptions into the district. The Classical AI agent detects state changes, validates assignments, and repairs routes.
      </p>

      {/* ── PRIMARY SECTION 1: NEW EMERGENCY ── */}
      <fieldset disabled={busy} className="primary-fieldset">
        <legend>New Emergency</legend>
        <div className="form-grid">
          <label>
            Type
            <select
              value={type}
              onChange={e => {
                const nextType = e.target.value
                setType(nextType)
                if (nextType === 'MEDICAL') {
                  if (patients === 0) setPatients(1)
                } else if (nextType === 'ACCIDENT') {
                  if (patients === 0) setPatients(1)
                } else if (nextType === 'EVACUATION') {
                  if (population < 30) setPopulation(45)
                }
              }}
            >
              {['MEDICAL', 'FIRE', 'ACCIDENT', 'FLOOD', 'INDUSTRIAL', 'EVACUATION'].map(t => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            Location
            <select value={location} onChange={e => setLocation(e.target.value)}>
              {Object.keys(world.nodes).map(n => <option key={n}>{n}</option>)}
            </select>
          </label>
          <label>
            Severity (1–5)
            <input type="number" min="1" max="5" value={severity} onChange={e => setSeverity(+e.target.value)} />
          </label>
          <label>
            Affected Population
            <input type="number" min="1" max="10000" value={population} onChange={e => setPopulation(+e.target.value)} />
          </label>
          <label>
            Patients
            <input type="number" min="0" max="12" value={patients} onChange={e => setPatients(+e.target.value)} />
          </label>
          <label>
            Critical ICU Cases
            <input type="number" min="0" max="12" value={critical} onChange={e => setCritical(+e.target.value)} />
          </label>
        </div>
        <button
          className="wide primary"
          style={{ marginTop: '12px' }}
          onClick={() => {
            const actualPatients = type === 'MEDICAL' ? Math.max(1, patients) : patients
            act('/incidents', {
              type,
              location,
              severity,
              affected_population: population,
              patients: actualPatients,
              critical_patients: Math.min(critical, actualPatients),
            })
          }}
        >
          Create emergency
        </button>
      </fieldset>

      {/* ── PRIMARY SECTION 2: ROAD & TRAFFIC CONDITIONS ── */}
      <fieldset disabled={busy} className="primary-fieldset">
        <legend>Road &amp; Traffic Conditions</legend>
        <label>
          Selected Road (or click directly in city)
          <select value={selectedRoad} onChange={e => selectRoad(e.target.value)}>
            {Object.values(world.roads).map(r => (
              <option key={r.id} value={r.id}>
                {r.id}{r.blocked ? ' · BLOCKED' : !r.known ? ' · UNKNOWN' : ''} ({r.traffic_level ?? 'FREE'})
              </option>
            ))}
          </select>
        </label>

        {currentRoad && (
          <div className="road-status-summary">
            <span>Status: <strong className={currentRoad.blocked ? 'critical' : 'green'}>{currentRoad.blocked ? 'BLOCKED' : 'OPEN'}</strong></span>
            <span>Traffic: <strong>{currentRoad.traffic_level ?? 'FREE'}</strong> ({(currentRoad.congestion_factor ?? 1).toFixed(2)}×)</span>
            <span>Travel time: <strong>{(currentRoad.travel_time ?? 0).toFixed(1)}s</strong></span>
          </div>
        )}

        <div className="button-row">
          <button onClick={() => act('/events/road-block', { road_id: selectedRoad })}>
            Block road
          </button>
          <button onClick={() => act('/events/road-reopen', { road_id: selectedRoad })}>
            Reopen road
          </button>
          <button
            title="Hide a blockage until an emergency vehicle navigates and discovers it"
            onClick={() => act('/events/road-unknown', { road_id: selectedRoad })}
          >
            Hide blockage
          </button>
        </div>

        <div className="traffic-quick-controls" style={{ marginTop: '10px' }}>
          <span className="eyebrow" style={{ display: 'block', marginBottom: '6px' }}>TRAFFIC CONGESTION ADJUSTMENTS</span>
          <div className="button-row">
            <button onClick={() => act('/events/traffic-congestion', { road_id: selectedRoad, levels: 1 })}>
              +1 Congestion
            </button>
            <button onClick={() => act('/events/traffic-congestion', { road_id: selectedRoad, levels: 2 })}>
              +2 Congestion
            </button>
            <button onClick={() => act('/events/traffic-clear', { road_id: selectedRoad, levels: 1 })}>
              −1 Clear
            </button>
            <button onClick={() => act('/events/traffic-clear', { road_id: selectedRoad, levels: 2 })}>
              −2 Clear
            </button>
          </div>
          <div className="button-row" style={{ marginTop: '6px' }}>
            <button onClick={() => act('/events/traffic-incident', { road_id: selectedRoad })}>
              Create traffic incident
            </button>
            <button onClick={() => act('/events/traffic-incident-clear', { road_id: selectedRoad })}>
              Clear incident
            </button>
          </div>
        </div>
      </fieldset>

      {/* ── COLLAPSIBLE SECONDARY CONTROLS ── */}
      <div className="secondary-controls-wrapper">
        <span className="eyebrow" style={{ display: 'block', marginBottom: '8px' }}>
          SECONDARY INFRASTRUCTURE CONTROLS
        </span>

        <details className="collapsible-group" disabled={busy}>
          <summary>
            <span>Hospital Network Capacity</span>
            <span className="muted" style={{ fontSize: '11px' }}>Adjust bed occupancy &amp; facility status</span>
          </summary>
          <div className="collapsible-content">
            <label>
              Hospital
              <select value={hospital} onChange={e => setHospital(e.target.value)}>
                {Object.values(world.hospitals).map(x => (
                  <option key={x.id} value={x.id}>
                    {x.name} ({x.occupied_beds}/{x.total_beds} beds · {x.occupied_icu}/{x.icu_beds} ICU)
                  </option>
                ))}
              </select>
            </label>
            <div className="button-row" style={{ marginTop: '8px' }}>
              <button onClick={() => act('/events/hospital-change', { hospital_id: hospital, icu_beds: h.occupied_icu })}>
                Remove free ICU
              </button>
              <button onClick={() => act('/events/hospital-change', { hospital_id: hospital, icu_beds: Math.min(h.total_beds, h.icu_beds + 1) })}>
                +1 ICU bed
              </button>
            </div>
            <button
              className="wide"
              style={{ marginTop: '8px' }}
              onClick={() => act('/events/hospital-change', { hospital_id: hospital, available: !h.available })}
            >
              {h.available ? 'Make hospital unavailable' : 'Restore hospital'}
            </button>
          </div>
        </details>

        <details className="collapsible-group" disabled={busy}>
          <summary>
            <span>Vehicle Fleet Availability</span>
            <span className="muted" style={{ fontSize: '11px' }}>Trigger vehicle breakdown or maintenance</span>
          </summary>
          <div className="collapsible-content">
            <label>
              Emergency Resource
              <select value={resource} onChange={e => setResource(e.target.value)}>
                {Object.values(world.resources).map(r => (
                  <option key={r.id} value={r.id}>
                    {r.id} ({r.type.replaceAll('_', ' ').toLowerCase()} · {r.status.toLowerCase()})
                  </option>
                ))}
              </select>
            </label>
            <div className="button-row" style={{ marginTop: '8px' }}>
              <button onClick={() => act('/events/vehicle-failure', { resource_id: resource })}>
                Fail vehicle
              </button>
              <button onClick={() => act('/events/vehicle-restore', { resource_id: resource })}>
                Restore vehicle
              </button>
            </div>
          </div>
        </details>

        <details className="collapsible-group">
          <summary>
            <span>Search Algorithm Laboratory</span>
            <span className="muted" style={{ fontSize: '11px' }}>Compare BFS, DFS, UCS, Greedy &amp; A* performance</span>
          </summary>
          <div className="collapsible-content">
            <p className="muted" style={{ fontSize: '11px', margin: '4px 0 10px' }}>
              Pathfinding benchmark from district depot (N00) to {location} using currently known roads.
            </p>
            <button className="wide" disabled={comparing} onClick={compare}>
              {comparing ? 'Benchmarking algorithms…' : 'Run comparison benchmark'}
            </button>
            {searchError && <p className="critical" role="alert" style={{ marginTop: '8px' }}>{searchError}</p>}
            {searches && (
              <table style={{ marginTop: '12px' }}>
                <thead>
                  <tr>
                    <th>Algorithm</th>
                    <th>Travel cost</th>
                    <th>Nodes explored</th>
                  </tr>
                </thead>
                <tbody>
                  {searches.map(r => (
                    <tr key={r.algorithm}>
                      <td><strong>{r.algorithm}</strong></td>
                      <td>{r.reachable ? `${r.cost.toFixed(1)}s` : 'Unreachable'}</td>
                      <td>{r.explored.length} nodes</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </details>
      </div>
    </div>
  )
}
