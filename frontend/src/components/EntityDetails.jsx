import { useEffect } from 'react'
import { useSimulation } from '../state/simulationStore'

const readableStr = value => value?.replaceAll('_', ' ').toLowerCase()
const time = seconds => `${String(Math.floor((seconds || 0) / 60)).padStart(2, '0')}:${String(Math.floor((seconds || 0) % 60)).padStart(2, '0')}`
const Row = ({ label, children }) => <div><dt>{label}</dt><dd>{children}</dd></div>

function conditionClass(condition) {
  if (condition === 'CRITICAL') return 'critical'
  if (condition === 'SERIOUS') return 'amber'
  return 'green'
}

function HealthBar({ score, condition }) {
  const color =
    condition === 'CRITICAL' ? 'var(--critical-text)' :
    condition === 'SERIOUS'  ? 'var(--warning-text)'  :
    'var(--available-text)'
  return (
    <div className="patient-health-bar-track" aria-label={`Health score ${Math.round(score)} of 100`}>
      <div
        className="patient-health-bar-fill"
        style={{ width: `${Math.max(0, Math.min(100, score))}%`, background: color }}
      />
    </div>
  )
}

function PatientCard({ patient, hospitals }) {
  const stabilised = patient.status === 'IN_TRANSIT' || patient.status === 'ADMITTED'
  const hospital = patient.hospital_id ? hospitals[patient.hospital_id] : null
  return (
    <div className={`patient-card${patient.condition === 'CRITICAL' ? ' patient-card--critical' : ''}`}>
      <div className="patient-card-header">
        <span className="patient-id">{patient.id}</span>
        <span className={`condition-badge condition-badge--${patient.condition.toLowerCase()}`}>
          {patient.condition}
        </span>
      </div>
      <HealthBar score={patient.health_score} condition={patient.condition} />
      <div className="patient-card-meta">
        <span>Score <strong>{patient.health_score.toFixed(1)}</strong></span>
        <span>Wait <strong>{patient.waiting_time.toFixed(0)}s</strong></span>
        <span className={conditionClass(patient.condition)}>{readableStr(patient.status)}</span>
      </div>
      {stabilised && (
        <p className="patient-stabilised">
          ✓ Deterioration paused —{' '}
          {patient.status === 'ADMITTED'
            ? `admitted to ${hospital?.name ?? patient.hospital_id}`
            : 'in transit to hospital'}
        </p>
      )}
      {patient.condition === 'CRITICAL' && !stabilised && (
        <p className="patient-critical-note">⚠ Critical — ICU required</p>
      )}
    </div>
  )
}

function PatientPanel({ incidentId, world }) {
  const patients = Object.values(world.patients).filter(p => p.incident_id === incidentId)
  if (!patients.length) return null
  return (
    <div className="patient-panel">
      <p className="eyebrow patient-panel-heading">PATIENTS · {patients.length}</p>
      {patients.map(p => (
        <PatientCard key={p.id} patient={p} hospitals={world.hospitals} />
      ))}
      <p className="muted patient-panel-disclaimer">
        Abstract simulation health score. Not a clinical diagnostic system.
      </p>
    </div>
  )
}

function VehicleStatusBadge({ status }) {
  const statusLower = status?.toLowerCase()
  let statusClass = 'status-badge--new'
  if (status === 'IDLE') statusClass = 'status-badge--idle'
  else if (status === 'RESPONDING') statusClass = 'status-badge--responding'
  else if (status === 'ON_SCENE') statusClass = 'status-badge--in_progress'
  else if (status === 'TRANSPORTING') statusClass = 'status-badge--transporting'
  else if (status === 'OFFLINE' || status === 'FAILED') statusClass = 'status-badge--unresolved'

  return (
    <span className={`status-badge ${statusClass}`}>
      {readableStr(statusLower)}
    </span>
  )
}

function VehicleRouteDisplay({ assignment, vehicleLocation, world }) {
  if (!assignment || !assignment.route?.path?.length) {
    return (
      <div className="selected-route">
        <span className="eyebrow">ROUTE ASSIGNMENT</span>
        <p className="muted" style={{ fontSize: '11px', marginTop: '6px' }}>
          Vehicle is on standby. No active route assigned.
        </p>
      </div>
    )
  }

  const path = assignment.route.path
  const currentIdx = path.indexOf(vehicleLocation)
  const isTransport = assignment.phase === 'TRANSPORTING'
  const destNode = path.at(-1)
  const hospitalName = assignment.hospital_id ? world.hospitals[assignment.hospital_id]?.name : null

  return (
    <div className="selected-route">
      <div className="route-header">
        <span className="eyebrow">
          {isTransport ? 'TRANSPORT ROUTE' : 'DISPATCH ROUTE'}
        </span>
        {assignment.route.cost != null && (
          <span className="mono muted" style={{ fontSize: '10px' }}>
            Est. {assignment.route.cost.toFixed(1)}s
          </span>
        )}
      </div>

      <div className="route-waypoints" aria-label="Route waypoints">
        {path.map((node, idx) => {
          const isPassed = currentIdx > -1 && idx < currentIdx
          const isCurrent = node === vehicleLocation
          const isDest = idx === path.length - 1
          const chipCls = isCurrent
            ? 'waypoint-chip waypoint-chip--current'
            : isPassed
            ? 'waypoint-chip waypoint-chip--passed'
            : isDest
            ? 'waypoint-chip waypoint-chip--dest'
            : 'waypoint-chip'

          return (
            <span key={`${node}-${idx}`} className="waypoint-item">
              <span className={chipCls}>
                {node}
                {isCurrent && <span className="waypoint-indicator">●</span>}
              </span>
              {idx < path.length - 1 && <span className="waypoint-arrow">→</span>}
            </span>
          )
        })}
      </div>

      <p className="route-summary muted">
        {isTransport
          ? `Destination: ${hospitalName || destNode} (${destNode})`
          : `Destination: ${assignment.incident_id || 'Incident'} at ${destNode}`}
      </p>

      {/* Secondary transport leg if currently in dispatch phase */}
      {!isTransport && assignment.transport_route?.path?.length > 0 && (
        <div className="secondary-route-leg">
          <div className="route-header">
            <span className="eyebrow">THEN PATIENT TRANSPORT</span>
            {assignment.transport_route.cost != null && (
              <span className="mono muted" style={{ fontSize: '10px' }}>
                Est. {assignment.transport_route.cost.toFixed(1)}s
              </span>
            )}
          </div>
          <p className="mono muted" style={{ fontSize: '11px', margin: '4px 0 0' }}>
            {assignment.transport_route.path.join(' → ')}
            {assignment.hospital_id && ` (${world.hospitals[assignment.hospital_id]?.name || assignment.hospital_id})`}
          </p>
        </div>
      )}
    </div>
  )
}

export default function EntityDetails({ world }) {
  const { selection, clearSelection, act, busy, selectEntity } = useSimulation()
  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape' && !document.querySelector('[aria-modal="true"]')) clearSelection()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [clearSelection])

  if (!selection) return null
  const { kind, id } = selection
  const collection = {
    vehicle: world.resources,
    incident: world.incidents,
    hospital: world.hospitals,
    road: world.roads,
  }
  const entity = collection[kind]?.[id]
  if (!entity) return null

  const assignment   = world.plan.assignments.find(a => a.resource_id === id)
  const reservations = world.plan.assignments.filter(a => a.hospital_id === id)
  const icu          = reservations.filter(a => world.patients[a.patient_id]?.critical).length

  const incidentPatients = kind === 'incident' ? Object.values(world.patients).filter(p => p.incident_id === id) : []
  const admittedPatients = incidentPatients.filter(p => p.status === 'ADMITTED').length
  const totalTasks = entity?.total_tasks || Math.max(entity?.completed_tasks?.length || 0, 1)
  const completedTasks = entity?.completed_tasks?.length || 0

  return (
    <section className="entity-panel" aria-label={`${kind} details`}>
      <div className="section-heading">
        <span className="eyebrow">{kind}</span>
        <button className="text-button" aria-label="Close details" onClick={clearSelection}>×</button>
      </div>
      <h2>{entity.name || id}</h2>
      <dl>
        {kind === 'vehicle' && <>
          <Row label="Status">
            <VehicleStatusBadge status={entity.status} />
          </Row>
          <Row label="Type">{readableStr(entity.type)}</Row>
          <Row label="Current location">
            <span className="node-chip">{entity.location}</span>
          </Row>
          <Row label="Assigned incident">
            {assignment?.incident_id ? (
              <button
                className="text-button inline-link"
                onClick={() => selectEntity('incident', assignment.incident_id)}
                title="Inspect assigned incident"
              >
                {assignment.incident_id} ↗
              </button>
            ) : (
              <span className="muted">None (Standby)</span>
            )}
          </Row>
          <Row label="Destination">
            {assignment ? (
              assignment.phase === 'TRANSPORTING'
                ? `${world.hospitals[assignment.hospital_id]?.name || assignment.hospital_id} (${assignment.route.path.at(-1)})`
                : `${assignment.route.path.at(-1)} (${assignment.incident_id || 'Incident'})`
            ) : (
              <span className="muted">Standby at {entity.location}</span>
            )}
          </Row>
          {assignment?.hospital_id && (
            <Row label="Assigned hospital">
              <button
                className="text-button inline-link"
                onClick={() => selectEntity('hospital', assignment.hospital_id)}
                title="Inspect assigned hospital"
              >
                {world.hospitals[assignment.hospital_id]?.name || assignment.hospital_id} ↗
              </button>
            </Row>
          )}
        </>}
        {kind === 'incident' && <>
          <Row label="Status">
            <span className={`status-badge status-badge--${entity.status.toLowerCase()}`}>
              {entity.status === 'RESOLVED' && '✓ '}{entity.status}
            </span>
          </Row>
          <Row label="Type">{readableStr(entity.type)}</Row>
          <Row label="Severity">{entity.severity} / 5 · Priority {entity.priority}</Row>
          <Row label="Affected population">{entity.affected_population}</Row>
          <Row label="Task progress">
            <strong>{completedTasks}</strong> / {totalTasks} completed
          </Row>
          {incidentPatients.length > 0 && (
            <Row label="Patient progress">
              <strong>{admittedPatients}</strong> / {incidentPatients.length} admitted
            </Row>
          )}
          <Row label="Created at">T+ {time(entity.created_at)}</Row>
          {entity.resolved_at != null && (
            <Row label="Resolved at">T+ {time(entity.resolved_at)}</Row>
          )}
          {entity.duration != null && (
            <Row label="Total response duration">{entity.duration}s</Row>
          )}
          {entity.resolution_reason && (
            <Row label="Resolution notes">{entity.resolution_reason}</Row>
          )}
          <Row label="Assigned resources">
            {entity.assigned_resources?.length
              ? entity.assigned_resources.map(resId => (
                  <button
                    key={resId}
                    className="text-button inline-link"
                    style={{ marginRight: '6px' }}
                    onClick={() => selectEntity('vehicle', resId)}
                    title={`Inspect vehicle ${resId}`}
                  >
                    {resId} ↗
                  </button>
                ))
              : (entity.status === 'RESOLVED' ? 'Response completed' : 'Awaiting allocation')}
          </Row>
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
          <Row label="Traffic">{(() => {
            const lvl = entity.traffic_level ?? 'FREE'
            const cls = lvl === 'GRIDLOCK' || lvl === 'HEAVY' ? 'critical' : lvl === 'MODERATE' ? 'amber' : lvl === 'LOW' ? 'amber' : 'green'
            return <span className={cls}>{lvl}</span>
          })()}</Row>
          <Row label="Congestion factor">{(entity.congestion_factor ?? 1).toFixed(2)}×</Row>
          <Row label="Base travel time">{(entity.base_travel_time || entity.travel_time).toFixed(1)}s</Row>
          <Row label="Current travel time">{entity.travel_time.toFixed(1)}s</Row>
        </>}
      </dl>

      {kind === 'vehicle' && (
        <VehicleRouteDisplay
          assignment={assignment}
          vehicleLocation={entity.location}
          world={world}
        />
      )}

      {kind === 'incident' && entity.status === 'RESOLVED' && (
        <div className="incident-resolved-banner" role="status">
          ✓ Emergency successfully resolved in {entity.duration != null ? `${entity.duration}s` : 'completed response'}
        </div>
      )}
      {kind === 'incident' && <PatientPanel incidentId={id} world={world} />}
      {kind === 'incident' && (
        <button
          className="wide"
          disabled={busy || entity.status === 'RESOLVED'}
          onClick={() => act('/events/incident-change', {
            incident_id: id,
            severity: Math.min(5, entity.severity + 1),
            affected_population: entity.affected_population + 20,
          })}
        >
          Escalate severity &amp; population
        </button>
      )}
      {kind === 'road' && (
        <button
          className="wide"
          disabled={busy}
          onClick={() => act(`/events/${entity.blocked ? 'road-reopen' : 'road-block'}`, { road_id: id })}
        >
          {entity.blocked ? 'Reopen road' : 'Block road'}
        </button>
      )}
    </section>
  )
}
