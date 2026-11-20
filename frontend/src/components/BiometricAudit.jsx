import React, { useEffect, useState } from 'react'
import { getBiometricAudit } from '../api'

export default function BiometricAudit() {
  const [audit, setAudit] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getBiometricAudit().then(setAudit).catch((err) => {
      setError(err.response?.data?.message || 'Could not load the biometric audit.')
    })
  }, [])

  return (
    <details className="card">
      <summary>Biometric Audit Log</summary>
      {error && <p className="error" role="alert">{error}</p>}
      {!audit && !error && <p role="status">Loading audit log…</p>}
      {audit && (
        <>
          <p className="muted">Face templates expire after {audit.retentionDays} days. Showing the latest 100 access events.</p>
          {audit.events.length === 0 && <p>No access events recorded yet.</p>}
          {audit.events.length > 0 && <ul>{audit.events.map((event) => (
            <li key={event.id}>
              {new Date(event.createdAt).toLocaleString()} · {event.action} · {event.outcome}
              {event.subjectId !== null && ` · Account ${event.subjectId}`}
              {event.templateCount !== null && ` · ${event.templateCount} templates checked`}
            </li>
          ))}</ul>}
        </>
      )}
    </details>
  )
}
