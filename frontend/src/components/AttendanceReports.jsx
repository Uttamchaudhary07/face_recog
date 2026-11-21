import React, { useEffect, useState } from 'react'
import { getAttendanceReports } from '../api'

function formatRate(rate) {
  return rate === null ? 'Not enough history' : `${rate}%`
}

function downloadReport(student, report) {
  const lines = [
    'Attendance report', student.name, student.userId || '',
    `Period: ${report.window.start} to ${report.window.end} (IST)`,
    `Target: ${report.target}%`,
    `Sessions attended: ${student.attendedSessions} of ${student.totalSessions}`,
    `Attendance: ${student.currentRate === null ? 'No sessions counted yet' : formatRate(student.currentRate)}`,
    `Projected next five sessions: ${formatRate(student.projectedRate)}`,
    ...student.alerts,
    ...student.timeline.map(({ date, subject, present }) => `${date} | ${subject} | ${present ? 'Present' : 'Absent'}`)
  ]
  const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `attendance-${student.id}.txt`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function AttendanceReports({ faculty = false }) {
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    getAttendanceReports().then((data) => {
      if (active) setReport(data)
    }).catch((err) => {
      if (active) setError(err.response?.data?.message || 'Could not load attendance reports.')
    })
    return () => { active = false }
  }, [])

  const student = report?.students[0]
  return (
    <section className="card">
      <h3>{faculty ? 'Below Attendance Target' : 'My Attendance Report'}</h3>
      {error && <p className="error" role="alert">{error}</p>}
      {!report && !error && <p role="status">Loading attendance…</p>}
      {report && (
        <>
          <p className="muted">Target {report.target}% over the last 90 days.</p>
          {faculty ? (
            report.students.length === 0
              ? <p>No students below the target.</p>
              : <ul className="attendance-alert-list">
                  {report.students.map(({ id, name, userId, currentRate, totalSessions, attendedSessions }) => (
                    <li key={id}>
                      <strong>{name}</strong>{userId && ` · ${userId}`} · {currentRate}% ({attendedSessions}/{totalSessions} sessions)
                    </li>
                  ))}
                </ul>
          ) : student && (
            <>
              <dl className="attendance-report-metrics">
                <div><dt>Attendance</dt><dd>{student.currentRate === null ? 'No sessions counted yet' : formatRate(student.currentRate)}</dd></div>
                <div><dt>Sessions attended</dt><dd>{student.attendedSessions} of {student.totalSessions}</dd></div>
                <div><dt>Missed sessions</dt><dd>{student.totalSessions - student.attendedSessions}</dd></div>
                <div><dt>Projected attendance</dt><dd>{formatRate(student.projectedRate)}</dd></div>
              </dl>
              {student.trend !== null && <p>Change from the previous five sessions {student.trend > 0 ? '+' : ''}{student.trend} percentage points.</p>}
              {student.alerts.length > 0 && <ul>{student.alerts.map(alert => <li key={alert}>{alert}</li>)}</ul>}
              <p className="muted">Check-ins count immediately. Missed sessions count after they close. Projections start after five sessions.</p>
              {student.timeline.length > 0 && (
                <div className="table table--session-history">
                  <div className="table__row table__head"><span>Subject</span><span>Date (IST)</span><span>Status</span></div>
                  {[...student.timeline].reverse().map(({ id, date, subject, present }) => (
                    <div key={id} className="table__row">
                      <span>{subject}</span><span>{date}</span><span>{present ? 'Present' : 'Absent'}</span>
                    </div>
                  ))}
                </div>
              )}
              <button type="button" className="btn btn--ghost" onClick={() => downloadReport(student, report)}>Download report</button>
            </>
          )}
        </>
      )}
    </section>
  )
}
