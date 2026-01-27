import React, { useEffect, useState } from 'react'
import { getLogs } from '../api'

export default function TeacherDashboard(){
  const [logs, setLogs] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    getLogs().then(setLogs).catch((err) => {
      setError(err.response?.data?.message || 'Failed to load logs')
    })
  }, [])

  return (
    <div className="page">
      <div className="card">
        <h2>Teacher Dashboard</h2>
        {error && <div className="error">{error}</div>}
      </div>
      <div className="card">
        <h3>Assigned Student Attendance</h3>
        <div className="table">
          <div className="table__row table__head">
            <span>Name</span>
            <span>User ID</span>
            <span>Method</span>
            <span>Date</span>
            <span>Time</span>
          </div>
          {logs.map((log) => (
            <div key={log._id} className="table__row">
              <span>{log.name}</span>
              <span>{log.userId || '-'}</span>
              <span>{log.method}</span>
              <span>{log.date}</span>
              <span>{log.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
