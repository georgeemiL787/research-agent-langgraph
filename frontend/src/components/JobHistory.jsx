/** Left sidebar showing the list of past research jobs. */
const STATUS_BADGE = {
  queued:   ['badge-queued',   '◔'],
  running:  ['badge-running',  '◕'],
  complete: ['badge-complete', '●'],
  failed:   ['badge-failed',   '✕'],
}

function timeAgo(iso) {
  if (!iso) return ''
  const secs = Math.floor((Date.now() - new Date(iso)) / 1000)
  if (secs < 60)       return `${secs}s ago`
  if (secs < 3600)     return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400)    return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

export default function JobHistory({ jobs, selectedJobId, onSelect }) {
  return (
    <div className="job-history">
      <div className="job-history-header">
        <div className="job-history-title">Job History</div>
      </div>
      <div className="job-history-list">
        {jobs.length === 0 && (
          <div className="job-history-empty">
            No research runs yet.<br />Submit a question to get started.
          </div>
        )}
        {jobs.map(job => {
          const [badgeCls, dot] = STATUS_BADGE[job.status] ?? ['badge-queued', '·']
          return (
            <div
              key={job.id}
              className={`job-item ${selectedJobId === job.id ? 'selected' : ''}`}
              onClick={() => onSelect(job.id)}
              title={job.question}
            >
              <div className="job-item-question">{job.question}</div>
              <div className="job-item-meta">
                <span className={`badge ${badgeCls}`}>
                  {dot} {job.status}
                </span>
                <span className="job-item-time">{timeAgo(job.created_at)}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
