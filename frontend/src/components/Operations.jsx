import { useSimulation } from '../state/simulationStore'

const time = seconds => `${String(Math.floor((seconds || 0) / 60)).padStart(2, '0')}:${String(Math.floor((seconds || 0) % 60)).padStart(2, '0')}`

function readableStr(value) {
  return value ? value.replaceAll('_', ' ').toLowerCase() : ''
}

function IncidentPatientSummary({ incidentId, patients }) {
  const incidentPatients = Object.values(patients).filter(p => p.incident_id === incidentId)
  if (!incidentPatients.length) return null
  const critical = incidentPatients.filter(p => p.condition === 'CRITICAL').length
  const serious  = incidentPatients.filter(p => p.condition === 'SERIOUS').length
  return (
    <span className="patient-summary-badges">
      {critical > 0 && <span className="condition-badge condition-badge--critical">{critical} CRIT</span>}
      {serious  > 0 && <span className="condition-badge condition-badge--serious">{serious} SRS</span>}
      {!critical && !serious && incidentPatients.length > 0 && (
        <span className="condition-badge condition-badge--stable">{incidentPatients.length} STABLE</span>
      )}
    </span>
  )
}

export default function Operations({ world, onSelect }) {
  const { selectEntity } = useSimulation()
  function inspect(kind, id) {
    selectEntity(kind, id)
    onSelect()
  }

  const allIncidents = Object.values(world.incidents)
  const activeIncidents = allIncidents.filter(i => i.status !== 'RESOLVED')
  const resolvedIncidents = allIncidents.filter(i => i.status === 'RESOLVED')
  const resources = Object.values(world.resources)

  return (
    <div className="operations">
      <p className="muted operations-intro">
        Select an entry to inspect its location, route, and telemetry in the 3D city.
      </p>

      {/* ── 1. ACTIVE INCIDENTS ── */}
      <section className="operations-section">
        <div className="operations-section-header">
          <h3>Active Incidents</h3>
          <span className="count-pill">{activeIncidents.length}</span>
        </div>
        {activeIncidents.length ? activeIncidents.map(i => {
          const incidentPatients = Object.values(world.patients).filter(p => p.incident_id === i.id)
          const admittedPatients = incidentPatients.filter(p => p.status === 'ADMITTED').length
          const totalTasks = i.total_tasks || Math.max(i.completed_tasks?.length || 0, 1)
          const completedTasks = i.completed_tasks?.length || 0
          return (
            <button className="directory-row" key={i.id} onClick={() => inspect('incident', i.id)}>
              <span>
                <strong style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  {i.id}
                  <span className={`status-badge status-badge--${i.status.toLowerCase()}`}>
                    {i.status}
                  </span>
                </strong>
                <small>{i.type} · Severity {i.severity}/5 · P{i.priority} · {i.affected_population} affected</small>
                <small className="muted">
                  Tasks: {completedTasks}/{totalTasks}
                  {incidentPatients.length > 0 && ` · Patients: ${admittedPatients}/${incidentPatients.length} admitted`}
                </small>
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                <small className="muted">T+ {time(i.created_at)}</small>
                <IncidentPatientSummary incidentId={i.id} patients={world.patients} />
              </span>
            </button>
          )
        }) : (
          <p className="empty">No active incidents. The district is clear.</p>
        )}
      </section>

      {/* ── 2. RESOURCE FLEET ── */}
      <section className="operations-section">
        <div className="operations-section-header">
          <h3>Resource Fleet</h3>
          <span className="count-pill">{resources.length}</span>
        </div>
        {resources.length ? resources.map(r => {
          const statusClass =
            r.status === 'IDLE' ? 'status-badge--idle' :
            r.status === 'RESPONDING' ? 'status-badge--responding' :
            r.status === 'ON_SCENE' ? 'status-badge--in_progress' :
            r.status === 'TRANSPORTING' ? 'status-badge--transporting' :
            'status-badge--unresolved'
          return (
            <button className="directory-row" key={r.id} onClick={() => inspect('vehicle', r.id)}>
              <span>
                <strong style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  {r.id}
                  <span className={`status-badge ${statusClass}`}>
                    {readableStr(r.status)}
                  </span>
                </strong>
                <small>{readableStr(r.type)} · At {r.location}</small>
                <small className="muted">
                  {r.assigned_incident ? `Assigned to ${r.assigned_incident}` : 'Standby / Available'}
                </small>
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                <span className="mono" style={{ fontSize: '11px', color: 'var(--muted)' }}>
                  Loc: {r.location}
                </span>
                {r.assigned_incident && (
                  <span className="blue" style={{ fontSize: '10px' }}>Active</span>
                )}
              </span>
            </button>
          )
        }) : (
          <p className="empty">No resources available.</p>
        )}
      </section>

      {/* ── 3. INCIDENT HISTORY ── */}
      <section className="operations-section">
        <div className="operations-section-header">
          <h3>Incident History</h3>
          <span className="count-pill">{resolvedIncidents.length}</span>
        </div>
        {resolvedIncidents.length ? resolvedIncidents.map(i => {
          const incidentPatients = Object.values(world.patients).filter(p => p.incident_id === i.id)
          const admittedPatients = incidentPatients.filter(p => p.status === 'ADMITTED').length
          const totalTasks = i.total_tasks || Math.max(i.completed_tasks?.length || 0, 1)
          const completedTasks = i.completed_tasks?.length || 0
          return (
            <button className="directory-row directory-row--resolved" key={i.id} onClick={() => inspect('incident', i.id)}>
              <span>
                <strong style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  {i.id}
                  <span className="status-badge status-badge--resolved">
                    ✓ RESOLVED
                  </span>
                </strong>
                <small>{i.type} · Response duration: {i.duration != null ? `${i.duration}s` : 'completed'}</small>
                <small className="muted">
                  Tasks: {completedTasks}/{totalTasks}
                  {incidentPatients.length > 0 && ` · Patients admitted: ${admittedPatients}/${incidentPatients.length}`}
                  {i.resolution_reason && ` · ${i.resolution_reason}`}
                </small>
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                <small className="muted">Created T+ {time(i.created_at)}</small>
                {i.resolved_at != null && (
                  <small style={{ color: 'var(--available-text)', fontSize: '10px' }}>
                    Resolved T+ {time(i.resolved_at)}
                  </small>
                )}
                <IncidentPatientSummary incidentId={i.id} patients={world.patients} />
              </span>
            </button>
          )
        }) : (
          <p className="empty">No resolved incidents yet.</p>
        )}
      </section>

      {/* ── 4. HOSPITAL NETWORK ── */}
      <section className="operations-section">
        <div className="operations-section-header">
          <h3>Hospital Network</h3>
          <span className="count-pill">{Object.keys(world.hospitals).length}</span>
        </div>
        {Object.values(world.hospitals).map(h => (
          <button className="directory-row" key={h.id} onClick={() => inspect('hospital', h.id)}>
            <span>
              <strong>{h.name}</strong>
              <small>{h.occupied_beds} / {h.total_beds} beds occupied · {h.occupied_icu} / {h.icu_beds} ICU</small>
            </span>
            <span className={h.available ? 'green' : 'critical'}>
              {h.available ? 'Available' : 'Unavailable'}
            </span>
          </button>
        ))}
      </section>

      {/* ── 5. ROADS ── */}
      <section className="operations-section">
        <div className="operations-section-header">
          <h3>Roads</h3>
          <span className="count-pill">{Object.keys(world.roads).length}</span>
        </div>
        <div className="road-directory">
          {Object.values(world.roads).map(r => (
            <button key={r.id} className={r.blocked ? 'critical' : ''} onClick={() => inspect('road', r.id)}>
              {r.id}{r.blocked ? ' · Blocked' : !r.known ? ' · Unknown' : ''}
            </button>
          ))}
        </div>
      </section>

      {/* ── 6. PENDING TASKS ── */}
      <section className="operations-section">
        <div className="operations-section-header">
          <h3>Pending Tasks</h3>
          <span className="count-pill">{Object.keys(world.plan.unassigned).length}</span>
        </div>
        {Object.entries(world.plan.unassigned).length ? (
          Object.entries(world.plan.unassigned).map(([id, reason]) => (
            <details className="pending" key={id}>
              <summary>{id}</summary>
              <p>{reason}</p>
            </details>
          ))
        ) : (
          <p className="empty">No pending tasks.</p>
        )}
      </section>
    </div>
  )
}
