import { useState, useEffect, useCallback, useRef } from 'react'
import JobHistory    from './components/JobHistory.jsx'
import ResearchForm  from './components/ResearchForm.jsx'
import WorkflowDAG   from './components/WorkflowDAG.jsx'
import LiveLog       from './components/LiveLog.jsx'
import ReportView    from './components/ReportView.jsx'
import EvidenceTable from './components/EvidenceTable.jsx'
import SettingsModal from './components/SettingsModal.jsx'
import { useSSE }    from './api/useSSE.js'
import { api }       from './api/client.js'

export default function App() {
  const [jobs,          setJobs]          = useState([])
  const [selectedJobId, setSelectedJobId] = useState(null)
  const [selectedJob,   setSelectedJob]   = useState(null)
  const [settings,      setSettings]      = useState(null)
  const [showSettings,  setShowSettings]  = useState(false)
  const [activeTab,     setActiveTab]     = useState('report')
  const [sidebarOpen,   setSidebarOpen]   = useState(true)
  const [submitError,   setSubmitError]   = useState(null)
  const prevJobStatusRef = useRef(null)

  // ── Data fetching ────────────────────────────────────────────────
  const fetchJobs = useCallback(async () => {
    try { setJobs(await api.get('/api/jobs')) } catch {}
  }, [])

  const fetchJob = useCallback(async (id) => {
    try { setSelectedJob(await api.get(`/api/jobs/${id}`)) } catch {}
  }, [])

  useEffect(() => {
    fetchJobs()
    api.get('/api/settings').then(setSettings).catch(() => {})
    const interval = setInterval(fetchJobs, 4000)
    return () => clearInterval(interval)
  }, [fetchJobs])

  useEffect(() => {
    if (selectedJobId) fetchJob(selectedJobId)
  }, [selectedJobId, fetchJob])

  // ── SSE stream for in-progress jobs ────────────────────────────
  const isLive = !!selectedJob && !['complete', 'failed'].includes(selectedJob.status)
  const { events, done } = useSSE(isLive ? selectedJobId : null)

  // When stream ends, re-fetch final job state
  useEffect(() => {
    if (done && selectedJobId) {
      fetchJob(selectedJobId)
      fetchJobs()
    }
  }, [done]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync job list entry when selectedJob changes status
  useEffect(() => {
    if (!selectedJob) return
    if (prevJobStatusRef.current !== selectedJob.status) {
      prevJobStatusRef.current = selectedJob.status
      fetchJobs()
    }
  }, [selectedJob?.status]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions ──────────────────────────────────────────────────────
  const handleSubmit = async (question, overrides) => {
    setSubmitError(null)
    try {
      const res = await api.post('/api/research', { question, demo: false, ...overrides })
      setSelectedJobId(res.job_id)
      setSelectedJob({ id: res.job_id, status: 'queued', question })
      setActiveTab('report')
      fetchJobs()
    } catch (err) {
      setSubmitError(err.message)
    }
  }

  const handleSelectJob = useCallback((id) => {
    setSelectedJobId(id)
    setActiveTab('report')
    setSubmitError(null)
  }, [])

  // ── Derived state ─────────────────────────────────────────────
  const status   = selectedJob?.status
  const result   = selectedJob?.result
  const isActive = status === 'running' || status === 'queued'
  const isDone   = status === 'complete' || status === 'failed'

  const outcome = (() => {
    if (!result) return null
    if (result.report?.startsWith('## Validation failed')) return 'validation-failed'
    if (result.status === 'complete') return 'complete'
    return 'review'
  })()

  return (
    <div className="app-shell">
      {/* Header */}
      <header className="app-header">
        <div className="header-left">
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarOpen(o => !o)}
            aria-label="Toggle sidebar"
          >☰</button>
          <div className="logo">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <defs>
                <radialGradient id="ng" cx="50%" cy="50%" r="50%">
                  <stop offset="0%"   stopColor="#a5b4fc" stopOpacity="1"/>
                  <stop offset="100%" stopColor="#6366f1" stopOpacity="1"/>
                </radialGradient>
                <filter id="glow">
                  <feGaussianBlur stdDeviation="1.2" result="blur"/>
                  <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
              </defs>
              {/* edges */}
              <g stroke="#6366f1" strokeOpacity="0.55" strokeWidth="1.2" filter="url(#glow)">
                <line x1="16" y1="5"  x2="27" y2="13"/>
                <line x1="16" y1="5"  x2="5"  y2="13"/>
                <line x1="27" y1="13" x2="27" y2="22"/>
                <line x1="5"  y1="13" x2="5"  y2="22"/>
                <line x1="27" y1="22" x2="16" y2="28"/>
                <line x1="5"  y1="22" x2="16" y2="28"/>
                <line x1="16" y1="5"  x2="16" y2="28"/>
                <line x1="5"  y1="13" x2="27" y2="22"/>
                <line x1="27" y1="13" x2="5"  y2="22"/>
              </g>
              {/* nodes */}
              <circle cx="16" cy="5"  r="2.8" fill="url(#ng)" filter="url(#glow)"/>
              <circle cx="27" cy="13" r="2.2" fill="url(#ng)" filter="url(#glow)" fillOpacity="0.85"/>
              <circle cx="5"  cy="13" r="2.2" fill="url(#ng)" filter="url(#glow)" fillOpacity="0.85"/>
              <circle cx="27" cy="22" r="2.2" fill="url(#ng)" filter="url(#glow)" fillOpacity="0.85"/>
              <circle cx="5"  cy="22" r="2.2" fill="url(#ng)" filter="url(#glow)" fillOpacity="0.85"/>
              <circle cx="16" cy="28" r="2.8" fill="url(#ng)" filter="url(#glow)"/>
            </svg>
            <span className="logo-text">Research Agent</span>
          </div>
        </div>
        <div className="header-right">
          {settings && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 8 }}>
              {settings.model}
            </span>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => setShowSettings(true)}>
            ⚙ Settings
          </button>
        </div>
      </header>

      <div className="app-body">
        {/* Sidebar */}
        {sidebarOpen && (
          <aside className="app-sidebar">
            <JobHistory
              jobs={jobs}
              selectedJobId={selectedJobId}
              onSelect={handleSelectJob}
            />
          </aside>
        )}

        {/* Main content */}
        <main className="app-main">
          <div className="main-content">

            {/* Research form */}
            <ResearchForm
              settings={settings}
              disabled={isActive}
              onSubmit={handleSubmit}
              jobs={jobs}
            />

            {submitError && (
              <div className="error-banner">⚠ {submitError}</div>
            )}

            {/* Queued banner */}
            {status === 'queued' && (
              <div className="queue-banner">
                <div className="spinner" />
                Job is queued — it will start when the current run finishes.
              </div>
            )}

            {/* Running: live workflow */}
            {status === 'running' && (
              <>
                <WorkflowDAG events={events} />
                <LiveLog events={events} done={done} />
              </>
            )}

            {/* Completed / failed */}
            {isDone && result && (
              <div className="results-section">
                <ResultBanner outcome={outcome} />
                <ResultMetrics job={selectedJob} result={result} />
                <div className="tabs">
                  {['report', 'evidence', 'workflow'].map(tab => (
                    <button
                      key={tab}
                      className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
                      onClick={() => setActiveTab(tab)}
                    >
                      {{ report: '📄 Report', evidence: '🔍 Evidence', workflow: '⚙ Workflow' }[tab]}
                    </button>
                  ))}
                </div>
                {activeTab === 'report'   && <ReportView  result={result} />}
                {activeTab === 'evidence' && <EvidenceTable sources={result.sources || []} errors={result.errors || []} />}
                {activeTab === 'workflow' && <WorkflowTrace trace={result.stage_trace || []} thinking={result.model_thinking || []} />}
              </div>
            )}

            {isDone && !result?.report && result?.error && (
              <div className="error-banner">❌ {result.error}</div>
            )}

          </div>
        </main>
      </div>

      {showSettings && (
        <SettingsModal
          settings={settings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────

function ResultBanner({ outcome }) {
  const map = {
    complete:           ['complete', '✅', 'Complete — evidence checks and self-critique passed. Not a factual guarantee.'],
    'validation-failed':['failed',   '⛔', 'Validation failed — the draft failed citation checks and was withheld.'],
    review:             ['review',   '⚠',  'Needs review — evidence gate or self-critique did not fully pass.'],
  }
  const [cls, icon, msg] = map[outcome] ?? ['review', '⚠', 'Unknown outcome.']
  return <div className={`result-banner ${cls}`}>{icon} {msg}</div>
}

function ResultMetrics({ job, result }) {
  return (
    <div className="result-metrics">
      {[
        ['Sources',   result?.sources?.length ?? 0],
        ['Rounds',    result?.rounds ?? 0],
        ['Revisions', result?.revisions ?? 0],
        job?.elapsed != null ? ['Elapsed', `${job.elapsed.toFixed(1)}s`] : null,
      ].filter(Boolean).map(([label, value]) => (
        <div key={label} className="result-metric">
          <span className="result-metric-value">{value}</span>
          <span className="result-metric-label">{label}</span>
        </div>
      ))}
    </div>
  )
}

function WorkflowTrace({ trace, thinking }) {
  const [openIdx, setOpenIdx] = useState(null)
  const LABELS = {
    plan: 'Plan', search: 'Search', assess: 'Assess',
    synthesize: 'Synthesize', critique: 'Critique',
    revise: 'Revision', finalize: 'Finalize',
  }
  const STATUS_ICONS = { completed: '✅', active: '⚡', failed: '❌' }

  return (
    <div>
      {trace.map((event, i) => {
        const label  = LABELS[event.node] ?? event.node
        const sfx    = event.round ? ` · round ${event.round}` : ''
        const sfx2   = event.node === 'revise' ? ` · rev ${event.revision ?? ''}` : ''
        const icon   = STATUS_ICONS[event.status] ?? '·'
        const details = event.details ?? {}
        const isOpen  = openIdx === i

        return (
          <div key={i} className="trace-event">
            <div
              className="trace-event-header"
              onClick={() => setOpenIdx(isOpen ? null : i)}
            >
              <span>{icon}</span>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{label}</span>
              <span className={`trace-tag ${event.status}`}>{event.status}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{sfx}{sfx2}</span>
              <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 12 }}>
                {isOpen ? '▲' : '▼'}
              </span>
            </div>
            {isOpen && (
              <div className="trace-event-body">
                {details.queries?.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <strong style={{ color: 'var(--text-secondary)' }}>Queries:</strong>
                    {details.queries.map((q, j) => <div key={j} style={{ marginTop: 3 }}>• {q}</div>)}
                  </div>
                )}
                {details.ratings?.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <strong style={{ color: 'var(--text-secondary)' }}>Ratings:</strong>
                    {details.ratings.map((r, j) => (
                      <div key={j} style={{ marginTop: 3 }}>
                        {r.id} · {r.score?.toFixed(2)} · {r.relevant ? 'relevant' : 'not relevant'} · {r.reason}
                      </div>
                    ))}
                  </div>
                )}
                {details.gaps?.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <strong style={{ color: 'var(--text-secondary)' }}>Gaps:</strong>
                    {details.gaps.map((g, j) => <div key={j} style={{ marginTop: 3 }}>• {g}</div>)}
                  </div>
                )}
                {details.critique && (
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                    {JSON.stringify(details.critique, null, 2)}
                  </pre>
                )}
                {event.error && (
                  <div style={{ color: 'var(--error)' }}>{event.error}</div>
                )}
              </div>
            )}
          </div>
        )
      })}
      {thinking?.length > 0 && (
        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' }}>
            🧠 Ollama reasoning ({thinking.length} block{thinking.length !== 1 ? 's' : ''})
          </summary>
          {thinking.map((t, i) => (
            <div key={i} className="trace-event-body" style={{ marginTop: 4 }}>
              {t}
            </div>
          ))}
        </details>
      )}
    </div>
  )
}
