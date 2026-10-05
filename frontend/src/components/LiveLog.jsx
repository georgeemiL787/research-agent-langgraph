import { useEffect, useRef } from 'react'

const STAGE_LABELS = {
  supervisor: 'Supervisor', planner: 'Planner', research_agent: 'Research Agent',
  analyzer: 'Analyzer', reviewer: 'Reviewer',
  retry_prep: 'Revise', finalize: 'Finalize',
}

const ICONS = {
  active: '⚡', completed: '✅', failed: '❌', status: 'ℹ',
  thinking: '🧠', complete: '🏁', error: '🚨',
}

function formatDetail(event) {
  const d = event.details ?? {}
  const parts = []
  if (d.strategy?.strategy)  parts.push(`Strategy: ${d.strategy.strategy} (${d.strategy.scope})`)
  if (d.tasks?.length)       parts.push(`Tasks: ${d.tasks.join(' · ')}`)
  if (d.queries?.length)     parts.push(`Queries: ${d.queries.join(' · ')}`)
  if (d.used_queries?.length) parts.push(`Searched: ${d.used_queries.join(', ')}`)
  if (d.sufficient != null)  parts.push(`Evidence sufficient: ${d.sufficient}`)
  if (d.gaps?.length)        parts.push(`Gaps: ${d.gaps.join('; ')}`)
  if (d.review_decision)     parts.push(`Review Decision: ${d.review_decision}`)
  if (d.review_reasons?.length) parts.push(`Review Reasons: ${d.review_reasons.join('; ')}`)
  if (d.errors?.length)      parts.push(`Errors: ${d.errors.join('; ')}`)
  if (event.error)           parts.push(event.error)
  return parts.join(' — ')
}

function EventRow({ event }) {
  let cls = ''
  let icon = '·'
  let title = ''
  let detail = ''

  if (event.type === 'stage_event') {
    cls   = event.status ?? 'active'
    icon  = ICONS[event.status] ?? '·'
    const label = STAGE_LABELS[event.node] ?? event.node
    const sfx   = event.round ? ` · round ${event.round}` : ''
    title  = `${label}${sfx}`
    detail = formatDetail(event)
  } else if (event.type === 'status') {
    cls   = 'active'
    icon  = 'ℹ'
    title = `Job ${event.status}`
  } else if (event.type === 'thinking') {
    cls   = 'thinking'
    icon  = '🧠'
    title = 'Reasoning'
    detail = event.text?.slice(0, 300) + (event.text?.length > 300 ? '…' : '')
  } else if (event.type === 'complete') {
    cls   = 'completed'
    icon  = '🏁'
    title = `Complete · ${event.elapsed?.toFixed(1)}s`
  } else if (event.type === 'error') {
    cls   = 'failed'
    icon  = '🚨'
    title = 'Error'
    detail = event.message
  }

  return (
    <div className={`log-entry ${cls}`}>
      <span className="log-icon">{icon}</span>
      <div className="log-content">
        <div className="log-title">{title}</div>
        {detail && <div className="log-detail">{detail}</div>}
      </div>
    </div>
  )
}

export default function LiveLog({ events = [], done = false }) {
  const bottomRef = useRef(null)

  // Auto-scroll to latest event
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events.length])

  return (
    <div className="live-log">
      <div className="live-log-header">
        <span className="live-log-title">
          <span className={`live-dot ${done ? 'done' : ''}`} />
          {done ? 'Stream complete' : 'Live events'}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {events.length} event{events.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="live-log-body">
        {events.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '8px 0' }}>
            Waiting for the agent to start…
          </div>
        )}
        {events.map((e, i) => <EventRow key={i} event={e} />)}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
