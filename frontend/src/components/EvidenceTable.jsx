import { useState, useMemo } from 'react'

function isNavigable(url) {
  if (!url) return false
  try {
    const { protocol, hostname, port, username, password } = new URL(url)
    if (!['http:', 'https:'].includes(protocol)) return false
    if (username || password) return false
    if (port && !['', '80', '443'].includes(port)) return false
    if (/^(localhost|.*\.localhost|.*\.local|.*\.internal)$/i.test(hostname)) return false
    return true
  } catch { return false }
}

function ScoreBar({ score }) {
  if (score == null) {
    return (
      <div>
        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-muted)' }}>—</span>
        <div className="score-bar-wrap" style={{ marginTop: 4 }}>
          <div className="score-bar" style={{ width: '0%', background: 'transparent' }} />
        </div>
      </div>
    )
  }
  const pct = Math.round(score * 100)
  const cls  = pct >= 65 ? '' : pct >= 40 ? 'mid' : 'low'
  return (
    <div>
      <span style={{ fontWeight: 700, fontSize: 14 }}>{score.toFixed(2)}</span>
      <div className="score-bar-wrap" style={{ marginTop: 4 }}>
        <div className={`score-bar ${cls}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function SourceCard({ source }) {
  const [expanded, setExpanded] = useState(false)
  const hasContent = Boolean(source.content)
  const failed     = Boolean(source.fetch_error)
  const safe       = isNavigable(source.url)

  const statusLabel = failed
    ? 'Fetch failed'
    : hasContent ? 'Full page' : 'Snippet only'

  return (
    <div className="source-card">
      <div className="source-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span className="source-id">{source.id}</span>
            {source.relevant === true && <span className="badge badge-complete">● relevant</span>}
            {source.relevant === false && <span className="badge badge-queued">○ not relevant</span>}
            {source.relevant == null && <span className="badge badge-queued" style={{ opacity: 0.7 }}>○ not assessed</span>}
          </div>
          <div className="source-title">{source.title || 'Untitled source'}</div>
        </div>
      </div>

      <div className="source-metrics">
        <div className="source-metric">
          <span className="source-metric-label">Credibility</span>
          <ScoreBar score={source.score} />
        </div>
        <div className="source-metric">
          <span className="source-metric-label">Retrieval</span>
          <span className="source-metric-value" style={{
            color: failed ? 'var(--error)' : hasContent ? 'var(--success)' : 'var(--warning)'
          }}>{statusLabel}</span>
        </div>
      </div>

      {safe && (
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-sm"
          style={{ display: 'inline-flex', marginBottom: 8 }}
        >
          ↗ Open source
        </a>
      )}

      <div className="source-reason">
        {source.reason ?? 'No rationale provided.'}
      </div>

      <button
        className="source-expand-btn"
        onClick={() => setExpanded(o => !o)}
      >
        {expanded ? '▲ Hide content' : '▼ Inspect extracted text'}
      </button>

      {expanded && (
        <div className="source-content-box">
          {source.content || source.snippet || 'No extracted text or snippet available.'}
          {source.fetch_error && `\n\nFetch error: ${source.fetch_error}`}
        </div>
      )}
    </div>
  )
}

export default function EvidenceTable({ sources = [], errors = [] }) {
  const [evidenceFilter,  setEvidenceFilter]  = useState('All')
  const [relevanceFilter, setRelevanceFilter] = useState('All')
  const [sortOrder,       setSortOrder]       = useState('Search order')
  const [query,           setQuery]           = useState('')

  const visible = useMemo(() => {
    let list = sources.filter(s => {
      const hasContent = Boolean(s.content)
      const failed     = Boolean(s.fetch_error)
      if (evidenceFilter === 'Full page'    && !hasContent)           return false
      if (evidenceFilter === 'Snippet only' && (hasContent || failed)) return false
      if (evidenceFilter === 'Fetch failed' && !failed)               return false
      if (relevanceFilter === 'Relevant'     && s.relevant !== true)          return false
      if (relevanceFilter === 'Not relevant' && s.relevant !== false)         return false
      if (relevanceFilter === 'Not assessed' && s.relevant != null)           return false
      if (query) {
        const text = `${s.id} ${s.title} ${s.url}`.toLowerCase()
        if (!text.includes(query.toLowerCase())) return false
      }
      return true
    })

    if (sortOrder === 'Score high–low') list = [...list].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    if (sortOrder === 'Score low–high') list = [...list].sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
    if (sortOrder === 'Title A–Z')      list = [...list].sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''))
    return list
  }, [sources, evidenceFilter, relevanceFilter, sortOrder, query])

  return (
    <div>
      {/* Filters */}
      <div className="evidence-filters">
        <div>
          <label className="form-label">Evidence type</label>
          <select className="select" value={evidenceFilter} onChange={e => setEvidenceFilter(e.target.value)}>
            {['All', 'Full page', 'Snippet only', 'Fetch failed'].map(o => <option key={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Relevance</label>
          <select className="select" value={relevanceFilter} onChange={e => setRelevanceFilter(e.target.value)}>
            {['All', 'Relevant', 'Not relevant', 'Not assessed'].map(o => <option key={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Sort by</label>
          <select className="select" value={sortOrder} onChange={e => setSortOrder(e.target.value)}>
            {['Search order', 'Score high–low', 'Score low–high', 'Title A–Z'].map(o => <option key={o}>{o}</option>)}
          </select>
        </div>
      </div>

      <div className="evidence-search">
        <input
          className="input"
          type="text"
          placeholder="Filter by title, source ID, or URL…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      <div className="evidence-count">
        Showing {visible.length} of {sources.length} sources.{' '}
        Credibility scores are model estimates, not verified facts.
      </div>

      {visible.map(s => <SourceCard key={s.id} source={s} />)}

      {errors.length > 0 && (
        <details style={{ marginTop: 16 }}>
          <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)' }}>
            ⚠ {errors.length} search error{errors.length !== 1 ? 's' : ''}
          </summary>
          <div style={{ marginTop: 8 }}>
            {errors.map((e, i) => (
              <div key={i} className="error-banner" style={{ marginBottom: 6 }}>
                {e}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
