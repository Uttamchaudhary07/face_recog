import React, { useEffect, useState } from 'react'
import { closeAttendanceSession, getAttendanceSessions, startAttendanceSession } from '../api'

const endTime = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata'
})

export default function AttendanceSessions({ admin = false }) {
  const [sessions, setSessions] = useState([])
  const [subjects, setSubjects] = useState([])
  const [subject, setSubject] = useState('')
  const [duration, setDuration] = useState('15')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    let active = true
    getAttendanceSessions()
      .then(data => {
        if (!active) return
        setSessions(data.sessions)
        setSubjects(data.subjects)
      })
      .catch(err => { if (active) setError(err.response?.data?.message || 'Could not load attendance sessions.') })
      .finally(() => { if (active) setLoading(false) })
    const ticker = setInterval(() => setNow(Date.now()), 5000)
    return () => {
      active = false
      clearInterval(ticker)
    }
  }, [])

  async function start(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const session = await startAttendanceSession(subject.trim(), Number(duration))
      setSessions(current => [session, ...current].slice(0, 30))
    } catch (err) {
      setError(err.response?.data?.message || 'Could not start the attendance session.')
    } finally {
      setBusy(false)
    }
  }

  async function close(id) {
    setBusy(true)
    setError('')
    try {
      const { expiresAt } = await closeAttendanceSession(id)
      setSessions(current => current.map(session => session.id === id ? { ...session, expiresAt } : session))
      setNow(Date.now())
    } catch (err) {
      setError(err.response?.data?.message || 'Could not close the attendance session.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <h3>Attendance Sessions</h3>
      {loading && <p>Loading sessions…</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {(admin || subjects.length > 0) && (
        <form className="form" onSubmit={start}>
          <label>
            Subject
            {admin
              ? <input required maxLength={100} value={subject} onChange={e => setSubject(e.target.value)} />
              : <select required value={subject} onChange={e => setSubject(e.target.value)}>
                  <option value="">Choose your subject</option>
                  {[...new Set(subjects)].map(name => <option key={name}>{name}</option>)}
                </select>}
          </label>
          <label>
            Duration (minutes)
            <input required type="number" min="1" max="120" value={duration} onChange={e => setDuration(e.target.value)} />
          </label>
          <button className="btn" disabled={loading || busy || !subject.trim()}>Start Session</button>
        </form>
      )}
      {!admin && !loading && !error && subjects.length === 0 && <p>Ask an admin to assign your teaching subjects.</p>}
      {sessions.map(session => {
        const open = new Date(session.expiresAt).getTime() > now
        return (
          <div key={session.id} style={{ marginTop: '1rem' }}>
            <strong>{session.subject}</strong>
            <p>{open
              ? <>Share code <code>{session.code}</code> with students. Ends {endTime.format(new Date(session.expiresAt))} IST.</>
              : <>Ended {endTime.format(new Date(session.expiresAt))} IST.</>}</p>
            {open && <button className="btn btn--ghost" disabled={busy} onClick={() => close(session.id)}>Close Session</button>}
          </div>
        )
      })}
    </section>
  )
}
