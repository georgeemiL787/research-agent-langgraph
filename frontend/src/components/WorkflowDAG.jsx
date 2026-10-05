/**
 * Animated workflow DAG visualisation.
 * Derives stage statuses and live metrics from the SSE event stream.
 */

const MAIN_STAGES = [
  { id: 'supervisor',     icon: '🧭',  label: 'Supervisor' },
  { id: 'planner',        icon: '🗺',  label: 'Planner' },
  { id: 'research_agent', icon: '🔍',  label: 'Research' },
  { id: 'analyzer',       icon: '✍️',  label: 'Analyzer' },
  { id: 'reviewer',       icon: '🔬',  label: 'Reviewer' },
  { id: 'finalize',       icon: '✅',  label: 'Finalize' },
]

function deriveState(events) {
  const stageStatus = {}
  let round = 0, sources = 0, revision = 0

  for (const e of events) {
    if (e.type === 'stage_event') {
      if (e.node) stageStatus[e.node] = e.status
      if (e.round    != null) round    = Math.max(round,    e.round)
      if (e.sources  != null) sources  = Math.max(sources,  e.sources)
      if (e.revision != null) revision = Math.max(revision, e.revision)
    }
  }
  return { stageStatus, round, sources, revision }
}

export default function WorkflowDAG({ events = [] }) {
  const { stageStatus, round, sources, revision } = deriveState(events)
  const reviseStatus = stageStatus['retry_prep']
  const hasRevise    = Boolean(reviseStatus)

  return (
    <div className="workflow-section">
      <div className="workflow-section-title">
        <div className="live-dot" />
        Live workflow
      </div>

      {/* Metrics row */}
      <div className="dag-metrics">
        {[['Round', round || '—'], ['Sources', sources], ['Revisions', revision]].map(([label, val]) => (
          <div key={label} className="dag-metric">
            <span className="dag-metric-value">{val}</span>
            <span className="dag-metric-label">{label}</span>
          </div>
        ))}
      </div>

      {/* Main flow */}
      <div className="dag-flow">
        {MAIN_STAGES.map((stage, i) => {
          const status = stageStatus[stage.id] ?? 'pending'
          return (
            <div key={stage.id} style={{ display: 'flex', alignItems: 'center' }}>
              <div className={`dag-node ${status}`}>
                <span className="dag-icon">{stage.icon}</span>
                <span className="dag-label">{stage.label}</span>
                <span className="dag-status-dot" />
              </div>
              {i < MAIN_STAGES.length - 1 && <div className="dag-connector" />}
            </div>
          )
        })}
      </div>

      {/* Revise node (appears when critique loops back) */}
      {hasRevise && (
        <div className="dag-revise-hint">
          ↩ Revise · {reviseStatus} — the agent is addressing critique issues
        </div>
      )}
    </div>
  )
}
