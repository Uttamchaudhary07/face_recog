import React, { useEffect, useMemo, useState } from 'react'
import { getLogs, getMyStudents, resetFaceEnrollment } from '../api'
import FaceEnrollModal from '../components/FaceEnrollModal.jsx'

function todayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

function downloadCsv(filename, rows, headers) {
  const escape = v => {
    const s = String(v ?? '')
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }
  const lines = [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))]
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

export default function TeacherDashboard(){
  const [logs, setLogs] = useState([])
  const [students, setStudents] = useState([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [resetting, setResetting] = useState(null)
  const [enrollTarget, setEnrollTarget] = useState(null)

  async function loadStudents() {
    const data = await getMyStudents().catch(() => [])
    setStudents(data)
  }

  useEffect(() => {
    getLogs()
      .then(setLogs)
      .catch(err => setError(err.response?.data?.message || 'Failed to load logs'))

    loadStudents()
  }, [])

  // Per-student attendance stats derived from all loaded logs
  const { studentStats, workingDays } = useMemo(() => {
    const allDates = new Set(logs.map(l => l.date))
    const statsMap = {}
    for (const log of logs) {
      if (!statsMap[log.userId]) statsMap[log.userId] = new Set()
      statsMap[log.userId].add(log.date)
    }
    return { studentStats: statsMap, workingDays: allDates.size }
  }, [logs])

  function exportTeacherAttendance(range) {
    const today = todayIST()
    let filtered = logs

    if (range === 'weekly') {
      const cutoff = new Date(today)
      cutoff.setDate(cutoff.getDate() - 6)
      const cutoffStr = cutoff.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
      filtered = logs.filter(l => l.date >= cutoffStr)
    } else if (range === 'monthly') {
      const mm = today.slice(0, 7)
      filtered = logs.filter(l => l.date.startsWith(mm))
    }

    const wDays = new Set(filtered.map(l => l.date)).size

    // Build stats from filtered logs
    const statsMap = {}
    for (const log of filtered) {
      if (!statsMap[log.userId]) {
        statsMap[log.userId] = { name: log.name, userId: log.userIdText, dates: new Set() }
      }
      statsMap[log.userId].dates.add(log.date)
    }

    // Include all assigned students even with 0 attendance
    for (const s of students) {
      if (!statsMap[s.id]) {
        statsMap[s.id] = { name: s.name, userId: s.userId || '', dates: new Set() }
      }
    }

    const headers = ['Name', 'User ID', 'Present Days', 'Working Days', 'Absent Days', 'Attendance %']
    const rows = Object.values(statsMap).map(st => {
      const present = st.dates.size
      const absent = wDays - present
      const pct = wDays > 0 ? ((present / wDays) * 100).toFixed(1) : '0.0'
      return [st.name, st.userId, present, wDays, absent, pct + '%']
    })

    const label = range === 'weekly' ? 'Weekly' : range === 'monthly' ? 'Monthly' : 'All'
    downloadCsv(`attendance_${label}_${today}.csv`, rows, headers)
  }

  async function handleResetFace(student) {
    if (!window.confirm(`Reset face enrollment for ${student.name}? They will need to be re-enrolled.`)) return
    setResetting(student.id)
    setError(''); setMessage('')
    try {
      await resetFaceEnrollment(student.id)
      setMessage(`Face enrollment reset for ${student.name}`)
      setStudents(prev => prev.map(s => s.id === student.id ? { ...s, hasFace: false } : s))
    } catch (err) {
      setError(err.response?.data?.message || 'Reset failed')
    } finally {
      setResetting(null)
    }
  }

  function pctPill(pct) {
    const n = parseFloat(pct)
    if (n >= 75) return 'pill--success'
    if (n >= 50) return 'pill--warn'
    return 'pill--neutral'
  }

  return (
    <div className="page">
      <div className="card">
        <h2>Teacher Dashboard</h2>
        {error && <div className="error">{error}</div>}
        {message && <div className="success">{message}</div>}
      </div>

      {/* ── Assigned Students ── */}
      <div className="card">
        <h3>My Students</h3>
        {students.length === 0
          ? <p className="muted">No students assigned yet. Ask your admin to assign students to your account.</p>
          : (
            <div className="table">
              <div
                className="table__row table__head"
                style={{ gridTemplateColumns: '1.5fr 1fr 0.8fr 0.9fr 1.3fr' }}
              >
                <span>Name</span>
                <span>User ID</span>
                <span>Face Status</span>
                <span>Attendance %</span>
                <span>Actions</span>
              </div>
              {students.map(s => {
                const present = studentStats[s.id]?.size ?? 0
                const pct = workingDays > 0 ? ((present / workingDays) * 100).toFixed(1) : '0.0'
                return (
                  <div
                    key={s.id}
                    className="table__row"
                    style={{ gridTemplateColumns: '1.5fr 1fr 0.8fr 0.9fr 1.3fr' }}
                  >
                    <span>
                      <div className="cell-title">{s.name}</div>
                      <div className="cell-meta">{s.email}</div>
                    </span>
                    <span>{s.userId || '—'}</span>
                    <span>
                      <span className={`pill ${s.hasFace ? 'pill--info' : 'pill--neutral'}`}>
                        {s.hasFace ? 'Enrolled' : 'Not Enrolled'}
                      </span>
                    </span>
                    <span>
                      <span className={`pill ${pctPill(pct)}`}>{pct}%</span>
                      <div className="cell-meta">{present}/{workingDays} days</div>
                    </span>
                    <span style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <button
                        className="btn"
                        style={{ fontSize: '0.8rem', padding: '0.4rem 0.7rem' }}
                        onClick={() => setEnrollTarget(s)}
                      >
                        Enroll Face
                      </button>
                      {s.hasFace && (
                        <button
                          className="btn btn--ghost"
                          disabled={resetting === s.id}
                          onClick={() => handleResetFace(s)}
                          style={{ fontSize: '0.8rem', padding: '0.4rem 0.7rem', color: '#dc2626', borderColor: '#dc2626' }}
                        >
                          {resetting === s.id ? 'Resetting...' : 'Reset Face'}
                        </button>
                      )}
                    </span>
                  </div>
                )
              })}
            </div>
          )
        }
      </div>

      {/* ── Attendance Logs ── */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <h3 style={{ margin: 0 }}>Student Attendance Logs</h3>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            <button className="btn btn--ghost" style={{ fontSize: '0.8rem' }} onClick={() => exportTeacherAttendance('weekly')}>Export Weekly</button>
            <button className="btn btn--ghost" style={{ fontSize: '0.8rem' }} onClick={() => exportTeacherAttendance('monthly')}>Export Monthly</button>
            <button className="btn btn--ghost" style={{ fontSize: '0.8rem' }} onClick={() => exportTeacherAttendance('all')}>Export All</button>
          </div>
        </div>
        <div className="table">
          <div className="table__row table__head">
            <span>Name</span>
            <span>User ID</span>
            <span>Method</span>
            <span>Date</span>
            <span>Time (IST)</span>
          </div>
          {logs.length === 0 && (
            <p className="muted" style={{ paddingTop: '0.5rem' }}>No attendance records yet.</p>
          )}
          {logs.map(log => (
            <div key={log.id} className="table__row">
              <span>{log.name}</span>
              <span>{log.userIdText || '—'}</span>
              <span className="pill pill--info">{log.method}</span>
              <span>{log.date}</span>
              <span>{log.time}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Face Enrollment Modal ── */}
      {enrollTarget && (
        <FaceEnrollModal
          targetUser={enrollTarget}
          onSuccess={() => {
            setMessage(`Face enrolled for ${enrollTarget.name}`)
            setEnrollTarget(null)
            loadStudents()
          }}
          onClose={() => setEnrollTarget(null)}
        />
      )}
    </div>
  )
}
