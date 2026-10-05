import { useState } from 'react'
import { api } from '../api/client.js'

export default function SettingsModal({ settings, onClose }) {
  const [health, setHealth] = useState(null)
  const [checking, setChecking] = useState(false)

  const checkHealth = async () => {
    setChecking(true)
    setHealth(null)
    try {
      const res = await api.get('/api/health')
      setHealth(res)
    } catch (err) {
      setHealth({ status: 'error', detail: err.message })
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">⚙ Settings</div>

        <div className="settings-field">
          <label className="form-label">Active model</label>
          <div className="settings-value">{settings?.model ?? '—'}</div>
        </div>

        <div className="settings-field">
          <label className="form-label">Ollama server</label>
          <div className="settings-value">{settings?.base_url ?? '—'}</div>
        </div>

        <div className="form-row" style={{ marginBottom: 16 }}>
          <div className="settings-field" style={{ margin: 0 }}>
            <label className="form-label">Default search rounds</label>
            <div className="settings-value">{settings?.max_rounds ?? '—'}</div>
          </div>
          <div className="settings-field" style={{ margin: 0 }}>
            <label className="form-label">Default revision budget</label>
            <div className="settings-value">{settings?.max_revisions ?? '—'}</div>
          </div>
        </div>

        <div className="form-row" style={{ marginBottom: 16 }}>
          <div className="settings-field" style={{ margin: 0 }}>
            <label className="form-label">Results per query</label>
            <div className="settings-value">{settings?.results_per_query ?? '—'}</div>
          </div>
          <div className="settings-field" style={{ margin: 0 }}>
            <label className="form-label">Max sources</label>
            <div className="settings-value">{settings?.max_sources ?? '—'}</div>
          </div>
        </div>

        <div className="settings-field">
          <label className="form-label">Output directory</label>
          <div className="settings-value">{settings?.output_dir ?? '—'}</div>
        </div>

        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
          To change these values, edit your <code style={{ fontFamily: 'JetBrains Mono, monospace', background: 'var(--bg-raised)', padding: '1px 5px', borderRadius: 3 }}>.env</code> file and restart the server.
        </div>

        {/* Health check */}
        <button
          className="btn btn-sm"
          style={{ marginBottom: 8 }}
          onClick={checkHealth}
          disabled={checking}
          id="check-connection-btn"
        >
          {checking
            ? <><div className="spinner" style={{ width: 12, height: 12 }} /> Checking…</>
            : '🔌 Check Ollama connection'}
        </button>

        {health && (
          <div className={`health-result ${health.status === 'ok' ? 'health-ok' : 'health-err'}`}>
            {health.status === 'ok'
              ? `✅ Connected · model "${health.model}" · ${health.installed?.length ?? 0} model(s) installed`
              : `❌ ${health.detail}`}
          </div>
        )}

        <div className="modal-footer">
          <button className="btn btn-primary btn-sm" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
