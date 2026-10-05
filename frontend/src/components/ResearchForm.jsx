import { useState } from 'react'

export default function ResearchForm({ settings, disabled, onSubmit, jobs = [] }) {
  const [question,     setQuestion]     = useState('')
  const [maxRounds,    setMaxRounds]    = useState(settings?.max_rounds ?? 3)
  const [maxRevisions, setMaxRevisions] = useState(settings?.max_revisions ?? 1)
  const [submitting,   setSubmitting]   = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Sync defaults when settings load
  const defaultRounds    = settings?.max_rounds    ?? 3
  const defaultRevisions = settings?.max_revisions ?? 1

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!question.trim() || disabled) return
    setSubmitting(true)
    try {
      await onSubmit(question.trim(), {
        max_rounds:    maxRounds,
        max_revisions: maxRevisions,
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="research-form" onSubmit={handleSubmit}>
      <h1 className="research-form-title">What would you like to research?</h1>
      <p className="research-form-subtitle">
        Ask a focused question. The agent plans search queries, fetches evidence, and writes a cited report.
      </p>

      {/* Recent history chips */}
      {(() => {
        const recent = [...new Map(jobs.map(j => [j.question, j])).values()].slice(0, 5)
        if (recent.length === 0) return null
        return (
          <div style={{ marginBottom: 14 }}>
            <div className="form-label" style={{ marginBottom: 7 }}>Recent</div>
            <div className="examples-row">
              {recent.map(j => (
                <button
                  key={j.id}
                  type="button"
                  className="example-chip"
                  disabled={disabled}
                  onClick={() => setQuestion(j.question)}
                  title={j.question}
                >
                  {j.question.length > 55 ? j.question.slice(0, 53) + '…' : j.question}
                </button>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Question textarea */}
      <div className="form-group">
        <label className="form-label" htmlFor="question-input">Research question</label>
        <textarea
          id="question-input"
          className="textarea"
          rows={4}
          maxLength={2000}
          placeholder="Ask a focused question. For example: compare two approaches using primary sources."
          value={question}
          disabled={disabled}
          onChange={e => setQuestion(e.target.value)}
        />
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, textAlign: 'right' }}>
          {question.length} / 2000
        </div>
      </div>



      {/* Advanced options */}
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        style={{ marginBottom: 14, color: 'var(--text-muted)' }}
        onClick={() => setShowAdvanced(o => !o)}
      >
        {showAdvanced ? '▲' : '▼'} Advanced options
      </button>

      {showAdvanced && (
        <div className="form-row" style={{ marginBottom: 14 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Search rounds (1–5)</label>
            <div className="slider-row">
              <input
                type="range" min={1} max={5}
                value={maxRounds}
                disabled={disabled}
                onChange={e => setMaxRounds(Number(e.target.value))}
              />
              <span className="slider-value">{maxRounds}</span>
            </div>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Revision budget (0–3)</label>
            <div className="slider-row">
              <input
                type="range" min={0} max={3}
                value={maxRevisions}
                disabled={disabled}
                onChange={e => setMaxRevisions(Number(e.target.value))}
              />
              <span className="slider-value">{maxRevisions}</span>
            </div>
          </div>
        </div>
      )}

      <div className="form-actions">
        <div className="form-mode-badge">
          {settings
            ? `🌐 Real research · ${settings.model}`
            : '🌐 Real research'}
        </div>
        <button
          type="submit"
          id="start-research-btn"
          className="btn btn-primary"
          disabled={!question.trim() || disabled || submitting}
        >
          {submitting || disabled
            ? <><div className="spinner accent" style={{ width: 14, height: 14 }} /> Running…</>
            : '🔍 Start research'}
        </button>
      </div>
    </form>
  )
}
