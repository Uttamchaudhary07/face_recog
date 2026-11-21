import AttendanceReports from '../components/AttendanceReports.jsx'
import React, { useEffect, useState } from 'react'
import { getLogs, getMyStudents, resetFaceEnrollment } from '../api'
import FaceEnrollModal from '../components/FaceEnrollModal.jsx'
import AttendanceSessions from '../components/AttendanceSessions.jsx'
import { exportAttendanceLogs } from '../utils/attendanceCsv.js'

export default function TeacherDashboard(){
  const [panel, setPanel] = useState('Sessions')
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

  useEffect(() => { loadStudents() }, [])

  useEffect(() => {
    if (panel !== 'Attendance') return
    let active = true
    getLogs().then(data => { if (active) setLogs(data) })
      .catch(() => { if (active) setError('Could not load the attendance logs.') })
    return () => { active = false }
  }, [panel])

  function exportTeacherAttendance(range) {
    if (!exportAttendanceLogs(logs, range)) setMessage('No check-ins to export for this period.')
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

  return (
    <div className="page">
      <div className="section">
        <h2>Teacher Dashboard</h2>
        <nav className="dashboard-actions" aria-label="Teacher dashboard sections">
          {['Sessions', 'My Students', 'Attendance'].map(section => (
            <button key={section} type="button" aria-pressed={panel === section}
              className={panel === section ? 'btn' : 'btn btn--ghost'}
              onClick={() => { setPanel(section); setError(''); setMessage('') }}>
              {section}
            </button>
          ))}
        </nav>
        {error && <div className="error">{error}</div>}
        {message && <div className="success">{message}</div>}
      </div>

      {panel === 'Sessions' && <AttendanceSessions />}
      {panel === 'My Students' && <div className="card">
        <h3>My Students</h3>
        {students.length === 0
          ? <p className="muted">No students assigned yet. Ask your admin to assign students to your account.</p>
          : (
            <div className="table">
              <div
                className="table__row table__head"
                style={{ gridTemplateColumns: '1.5fr 1fr 0.8fr 1.3fr' }}
              >
                <span>Name</span>
                <span>User ID</span>
                <span>Face Status</span>
                <span>Actions</span>
              </div>
              {students.map(s => (
                  <div
                    key={s.id}
                    className="table__row"
                    style={{ gridTemplateColumns: '1.5fr 1fr 0.8fr 1.3fr' }}
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
              ))}
            </div>
          )
        }
      </div>}

      {panel === 'Attendance' && <div className="section">
        <AttendanceReports faculty />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <h3 style={{ margin: 0 }}>Student Attendance Logs</h3>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            <button className="btn btn--ghost" style={{ fontSize: '0.8rem' }} onClick={() => exportTeacherAttendance('weekly')}>Export 7 Days</button>
            <button className="btn btn--ghost" style={{ fontSize: '0.8rem' }} onClick={() => exportTeacherAttendance('monthly')}>Export 30 Days</button>
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
              <span>
                <span className="pill pill--info">{log.method}</span>
                {log.session && <div className="cell-meta">{log.session.subject}</div>}
              </span>
              <span>{log.date}</span>
              <span>{log.time}</span>
            </div>
          ))}
        </div>
      </div>}

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
