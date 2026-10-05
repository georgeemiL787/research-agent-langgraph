import ReactMarkdown from 'react-markdown'
import remarkGfm     from 'remark-gfm'

/** Returns true for safe, public HTTP(S) URLs (mirrors Python navigable_url). */
function isNavigable(url) {
  if (!url) return false
  try {
    const { protocol, hostname, port, username, password } = new URL(url)
    if (!['http:', 'https:'].includes(protocol)) return false
    if (username || password) return false
    if (port && !['', '80', '443'].includes(port)) return false
    if (/^(localhost|.*\.localhost|.*\.local|.*\.internal)$/i.test(hostname)) return false
    return true
  } catch {
    return false
  }
}

function buildSourceLinks(sources) {
  const map = {}
  for (const s of sources) {
    if (s.id && isNavigable(s.url)) map[s.id] = s.url
  }
  return map
}

function downloadText(content, filename, mime) {
  const blob = new Blob([content], { type: mime })
  const a    = document.createElement('a')
  a.href     = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

export default function ReportView({ result }) {
  const report  = result?.report ?? ''
  const sources = result?.sources ?? []
  const links   = buildSourceLinks(sources)

  // Replace [S1] with markdown links where URL is safe
  const processedReport = report.replace(/\[(S\d+)\]/g, (match, id) =>
    links[id] ? `[${id}](${links[id]})` : match
  )

  const limitations = result?.gaps ?? []
  const issues      = Array.isArray(result?.review_reasons) ? result.review_reasons : []

  return (
    <div className="report-view">
      {/* Download actions */}
      <div className="report-actions">
        <button
          className="btn btn-sm"
          onClick={() => downloadText(report, 'research-report.md', 'text/markdown')}
        >
          ↓ Download Markdown
        </button>
        <button
          className="btn btn-sm"
          onClick={() => downloadText(
            JSON.stringify(result, null, 2),
            'research.json',
            'application/json'
          )}
        >
          ↓ Download JSON
        </button>
      </div>

      {/* Report body */}
      <div className="report-content">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {processedReport}
        </ReactMarkdown>
      </div>

      {/* Limitations */}
      {(limitations.length > 0 || issues.length > 0) && (
        <div className="report-limitations">
          <div className="report-limitations-title">⚠ Limitations & unresolved critique</div>
          <ul>
            {limitations.map((g, i) => <li key={`g-${i}`}>{g}</li>)}
            {issues.map((iss, i)     => <li key={`c-${i}`}>{iss}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}
