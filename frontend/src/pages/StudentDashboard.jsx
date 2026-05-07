import React, { useEffect, useState } from 'react'
import { getLogs, getMe } from '../api'

export default function StudentDashboard(){
  const [logs, setLogs] = useState([])
  const [profile, setProfile] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getMe().then(setProfile).catch(() => {})
    getLogs()
      .then(setLogs)
      .catch(err => setError(err.response?.data?.message || 'Failed to load attendance logs'))
  }, [])

  return (
    <div className="page">
      <div className="card">
        <h2>Student Dashboard</h2>
        {profile && (
          <div className="stack" style={{ marginTop: '0.5rem' }}>
            <p><strong>Name:</strong> {profile.name}</p>
            <p><strong>User ID:</strong> {profile.userId || 'Not assigned'}</p>
            <p>
              <strong>Face Enrollment:</strong>{' '}
              <span className={`pill ${profile.hasFace ? 'pill--success' : 'pill--warn'}`}>
                {profile.hasFace ? 'Enrolled' : 'Not enrolled — contact your teacher or admin'}
              </span>
            </p>
          </div>
        )}
        {error && <div className="error" style={{ marginTop: '0.8rem' }}>{error}</div>}
      </div>

      <div className="card">
        <h3>My Attendance</h3>
        <div className="table">
          <div className="table__row table__head">
            <span>Date</span>
            <span>Time</span>
            <span>Method</span>
          </div>
          {logs.length === 0 && !error && (
            <p className="muted" style={{ paddingTop: '0.5rem' }}>No attendance records yet.</p>
          )}
          {logs.map(log => (
            <div key={log.id} className="table__row">
              <span>{log.date}</span>
              <span>{log.time}</span>
              <span className="pill pill--info">{log.method}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
