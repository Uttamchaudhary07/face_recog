import React, { useEffect, useState } from 'react'
import { getAttendanceReports } from '../api'

function formatRate(value) {
  return value === null ? 'Insufficient history' : `${value}%`
}

function downloadReport(student, report) {
  const lines = [
    'Attendance report', student.name, student.userId || '',
    `Period: ${report.window.start} through the day before ${report.window.before}`,
    `Target: ${report.target}%`,
    `Recorded present days: ${student.presentDays}`,
    `Observed attendance: ${formatRate(student.currentRate)}`,
    `Projected next 5 observed days: ${formatRate(student.projectedRate)}`,
    ...student.alerts,
    'Observed days are inferred from recorded attendance in the same department, semester, and section.',
    ...student.timeline.map(({ date, present }) => `${date}: ${present ? 'Present' : 'No attendance recorded'}`)
  ]
  const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `attendance-${student.id}.txt`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function AttendanceReports({ faculty = false, refreshKey }) {
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setError('')
    getAttendanceReports().then((data) => {
      if (active) setReport(data)
    }).catch((err) => {
      if (active) setError(err.response?.data?.message || 'Could not load attendance reports.')
    })
    return () => { active = false }
  }, [refreshKey])

  const alerts = report?.students.filter((student) => student.alerts.length) || []
  const hasForecasts = report?.students.some((student) => student.projectedRate !== null)
  return (
    <section className="card">
      <h3>{faculty ? 'Attendance Reports and Alerts' : 'My Attendance Report'}</h3>
      {error && <p className="error" role="alert">{error}</p>}
      {!report && !error && <p role="status">Loading attendance report…</p>}
      {report && (
        <>
          <p className="muted">Target {report.target}%. Reports use the last 90 days. A day counts when someone in the same department, semester, and section records attendance. Estimates start after five observed days.</p>
          {faculty && hasForecasts && <p role="status">{alerts.length ? `${alerts.length} student${alerts.length === 1 ? '' : 's'} with attendance alerts` : 'No attendance alerts'}</p>}
          {faculty && !hasForecasts && report.students.length > 0 && <p>Not enough attendance history to check for alerts.</p>}
          {report.students.length === 0 && <p>No students available for this report.</p>}
          {[...alerts, ...report.students.filter((student) => !student.alerts.length)].map((student) => (
            <details key={student.id} className="section" open={faculty ? undefined : true}>
              <summary>{student.name}{student.userId ? ` · ${student.userId}` : ''}{student.alerts.length ? ' · Attendance alert' : ''}</summary>
              <dl>
                <dt>Attendance in this period</dt>
                <dd>{student.observedDays ? `${formatRate(student.currentRate)} over ${student.observedDays} observed days` : `${student.presentDays} days recorded`}</dd>
                <dt>Projected rate over the next five observed days</dt>
                <dd>{formatRate(student.projectedRate)}</dd>
                {student.trend !== null && <><dt>Change from the previous five observed days</dt><dd>{student.trend > 0 ? '+' : ''}{student.trend} percentage points</dd></>}
              </dl>
              {student.alerts.length > 0 && <ul>{student.alerts.map((alert) => <li key={alert}>{alert}</li>)}</ul>}
              <button type="button" className="btn btn--ghost" onClick={() => downloadReport(student, report)}>Download report</button>
            </details>
          ))}
        </>
      )}
    </section>
  )
}
