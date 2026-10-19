import { useEffect } from 'react'
import { useSimulation } from '../state/simulationStore'

const readable = value => value?.replaceAll('_', ' ').toLowerCase()
const Row = ({ label, children }) => <div><dt>{label}</dt><dd>{children}</dd></div>

export default function EntityDetails({ world }) {
  const { selection, clearSelection, act, busy } = useSimulation()
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && !document.querySelector('[aria-modal="true"]')) clearSelection() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [clearSelection])
  if (!selection) return null
  const { kind, id } = selection
  const collection = { vehicle: world.resources, incident: world.incidents, hospital: world.hospitals, road: world.roads }
  const entity = collection[kind]?.[id]
  if (!entity) return null
  const assignment = world.plan.assignments.find(a => a.resource_id === id)
  const reservations = world.plan.assignments.filter(a => a.hospital_id === id)
  const icu = reservations.filter(a => world.patients[a.patient_id]?.critical).length
  return <section className="entity-panel" aria-label={`${kind} details`}>
    <div className="section-heading"><span className="eyebrow">{kind}</span><button className="text-button" aria-label="Close details" onClick={clearSelection}>×</button></div>
    <h2>{entity.name || id}</h2>
    <dl>
      {kind === 'vehicle' && <>
        <Row label="Type">{readable(entity.type)}</Row><Row label="Status">{readable(entity.status)}</Row>
        <Row label="Location">{entity.location}</Row>
        <Row label="Destination">{assignment ? assignment.route.path.at(-1) : 'Standby'}</Row>
        {assignment && <><Row label="Incident">{assignment.incident_id}</Row><Row label="Hospital">{assignment.hospital_id ? world.hospitals[assignment.hospital_id].name : 'Not required'}</Row></>}
      </>}
      {kind === 'incident' && <>
        <Row label="Type">{readable(entity.type)}</Row><Row label="Severity">{entity.severity} / 5 · Priority {entity.priority}</Row>
        <Row label="Affected population">{entity.affected_population}</Row><Row label="Status">{readable(entity.status)}</Row>
        <Row label="Assigned resources">{entity.assigned_resources.join(', ') || 'Awaiting allocation'}</Row>
      </>}
      {kind === 'hospital' && <>
        <Row label="Status">{entity.available ? 'Available' : 'Unavailable'}</Row>
        <Row label="Occupied beds">{entity.occupied_beds} / {entity.total_beds}</Row>
        <Row label="Available beds">{entity.total_beds - entity.occupied_beds - reservations.length}</Row>
        <Row label="ICU occupancy">{entity.occupied_icu} / {entity.icu_beds}</Row>
        <Row label="Reserved capacity">{reservations.length} beds · {icu} ICU</Row>
        <Row label="Available ICU">{entity.icu_beds - entity.occupied_icu - icu}</Row>
      </>}
      {kind === 'road' && <>
        <Row label="Intersections">{entity.a} ↔ {entity.b}</Row>
        <Row label="Status">{!entity.known ? 'Unknown · not yet observed' : entity.blocked ? 'Blocked' : 'Available'}</Row>
        <Row label="Traversal">{!entity.known ? 'Assumed available' : entity.blocked ? 'Not permitted' : 'Permitted'}</Row>
        <Row label="Travel time">{entity.travel_time}s</Row>
      </>}
    </dl>
    {kind === 'vehicle' && <div className="selected-route"><span className="muted">Selected route</span><p className="mono">{assignment?.route.path.join(' → ') || 'No active route'}</p>
      {assignment?.phase !== 'TRANSPORTING' && assignment?.transport_route && <><span className="muted">Then patient transport</span><p className="mono">{assignment.transport_route.path.join(' → ')}</p></>}
    </div>}
    {kind === 'incident' && <button className="wide" disabled={busy || entity.status === 'RESOLVED'} onClick={() => act('/events/incident-change', { incident_id: id, severity: Math.min(5, entity.severity + 1), affected_population: entity.affected_population + 20 })}>Escalate severity & population</button>}
    {kind === 'road' && <button className="wide" disabled={busy} onClick={() => act(`/events/${entity.blocked ? 'road-reopen' : 'road-block'}`, { road_id: id })}>{entity.blocked ? 'Reopen road' : 'Block road'}</button>}
  </section>
}
