import { useState, useEffect, useRef } from 'react'

/**
 * Subscribe to the SSE stream for a job.
 *
 * Returns accumulated events and a `done` flag.
 * Resets automatically when jobId changes.
 * Pass null/undefined to disconnect.
 */
export function useSSE(jobId) {
  const [events, setEvents] = useState([])
  const [done, setDone]     = useState(false)
  const esRef               = useRef(null)

  useEffect(() => {
    // Cleanup previous connection
    if (esRef.current) {
      esRef.current.close()
      esRef.current = null
    }

    if (!jobId) {
      setEvents([])
      setDone(false)
      return
    }

    setEvents([])
    setDone(false)

    const es = new EventSource(`/api/jobs/${jobId}/stream`)
    esRef.current = es

    es.onmessage = (e) => {
      let data
      try { data = JSON.parse(e.data) } catch { return }

      if (data.type === '__done__') {
        setDone(true)
        es.close()
        return
      }

      setEvents((prev) => [...prev, data])

      if (data.type === 'complete' || data.type === 'error') {
        setDone(true)
        es.close()
      }
    }

    es.onerror = () => {
      setDone(true)
      es.close()
    }

    return () => {
      es.close()
      esRef.current = null
    }
  }, [jobId])

  return { events, done }
}
