import React, { useEffect, useMemo, useRef, useState } from 'react'
import jsQR from 'jsqr'
import {
  adminListUsers, adminUpdateUser, adminCreateUser, adminDeleteUser,
  adminAttendance, adminCsvImport, resetFaceEnrollment, assignStudentsCsv
} from '../api'
import FaceEnrollModal from '../components/FaceEnrollModal.jsx'

// ─── CSV Download Utility ─────────────────────────────────────────────────────
function downloadCsv(filename, rows, headers) {
  const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`
  const lines = [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function todayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

export default function AdminDashboard() {
  const [users, setUsers] = useState([])
  const [logs, setLogs] = useState([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [searchQuery, setSearchQuery] = useState('')
  const [faceFilter, setFaceFilter] = useState('all')

  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState({ name: '', email: '', password: '', role: 'student', userId: '' })

  const [actionUser, setActionUser] = useState(null)
  const [actionType, setActionType] = useState('')
  const [actionValue, setActionValue] = useState('')
  const [actionOpenId, setActionOpenId] = useState(null)

  const [enrollTarget, setEnrollTarget] = useState(null)

  // Barcode scanner
  const [scanStatus, setScanStatus] = useState('')
  const [scanActive, setScanActive] = useState(false)
  const [manualEntry, setManualEntry] = useState(false)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const detectorRef = useRef(null)

  // Attendance log filters
  const [logFilters, setLogFilters] = useState({ date: '', role: 'all', method: 'all' })
  const [logPage, setLogPage] = useState(1)
  const PAGE_SIZE = 10

  // CSV import (bulk users)
  const [csvOpen, setCsvOpen] = useState(false)
  const [csvResult, setCsvResult] = useState(null)
  const [csvLoading, setCsvLoading] = useState(false)
  const csvInputRef = useRef(null)

  // Student assignment via CSV
  const [assignCsvRef] = [useRef(null)]
  const [assignLoading, setAssignLoading] = useState(false)
  const [assignResult, setAssignResult] = useState(null)

  async function load() {
    try {
      const [userData, logData] = await Promise.all([adminListUsers(), adminAttendance()])
      setUsers(userData)
      setLogs(logData)
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load data')
    }
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if ('BarcodeDetector' in window) {
      detectorRef.current = new BarcodeDetector({
        formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e']
      })
    }
  }, [])

  // ─── Filtered users ───────────────────────────────────────────────────────
  const filteredUsers = useMemo(() => {
    let result = users
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      result = result.filter(u =>
        u.name?.toLowerCase().includes(q) ||
        u.userId?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q)
      )
    }
    if (faceFilter === 'enrolled') result = result.filter(u => u.hasFace)
    if (faceFilter === 'not_enrolled') result = result.filter(u => !u.hasFace)
    return result
  }, [users, searchQuery, faceFilter])

  // ─── Stats ────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const today = todayIST()
    const workingDays = new Set(logs.map(l => l.date)).size
    const studentLogs = logs.filter(l => l.role === 'student')
    const studentCount = users.filter(u => u.role === 'student').length
    const avgPct = workingDays > 0 && studentCount > 0
      ? Math.round((studentLogs.length / (studentCount * workingDays)) * 100)
      : 0
    return {
      total: users.length,
      students: studentCount,
      teachers: users.filter(u => u.role === 'teacher').length,
      pending: users.filter(u => u.role === 'pending').length,
      enrolled: users.filter(u => u.hasFace).length,
      todayCount: logs.filter(l => l.date === today).length,
      avgPct
    }
  }, [users, logs])

  // ─── Filtered logs ────────────────────────────────────────────────────────
  const filteredLogs = useMemo(() => logs.filter(log => {
    if (logFilters.date && log.date !== logFilters.date) return false
    if (logFilters.role !== 'all' && log.role !== logFilters.role) return false
    if (logFilters.method !== 'all' && log.method !== logFilters.method) return false
    return true
  }), [logs, logFilters])

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE))
  const pagedLogs = filteredLogs.slice((logPage - 1) * PAGE_SIZE, logPage * PAGE_SIZE)
  useEffect(() => { if (logPage > totalPages) setLogPage(totalPages) }, [logPage, totalPages])

  // ─── Export Attendance CSV ────────────────────────────────────────────────
  function exportAttendance(range) {
    const today = todayIST()
    let startDate = null
    let label = 'all'

    if (range === 'weekly') {
      const d = new Date(); d.setDate(d.getDate() - 7)
      startDate = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
      label = 'weekly'
    } else if (range === 'monthly') {
      const d = new Date(); d.setDate(d.getDate() - 30)
      startDate = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
      label = 'monthly'
    }

    const filtered = startDate ? logs.filter(l => l.date >= startDate) : logs
    if (filtered.length === 0) { setMessage('No attendance data for this period.'); return }

    const workingDays = new Set(filtered.map(l => l.date)).size

    // Build email lookup from users list
    const userByUserId = {}
    for (const u of users) { if (u.userId) userByUserId[u.userId] = u }

    // Group by student
    const byStudent = {}
    for (const log of filtered) {
      const key = log.userIdText || log.name
      if (!byStudent[key]) {
        byStudent[key] = {
          name: log.name,
          userId: log.userIdText || '-',
          email: userByUserId[log.userIdText]?.email || '-',
          role: log.role,
          presentDays: 0,
          lastDate: log.date,
          lastTime: log.time
        }
      }
      byStudent[key].presentDays++
    }

    const headers = ['Name', 'User ID', 'Email', 'Role', 'Present Days', 'Absent Days', 'Attendance %', 'Last Attendance (IST)']
    const rows = Object.values(byStudent).map(s => {
      const absent = Math.max(0, workingDays - s.presentDays)
      const pct = ((s.presentDays / workingDays) * 100).toFixed(1)
      return [s.name, s.userId, s.email, s.role, s.presentDays, absent, `${pct}%`, `${s.lastDate} ${s.lastTime}`]
    })

    downloadCsv(`attendance_${label}_${today}.csv`, rows, headers)
  }

  // ─── User actions ─────────────────────────────────────────────────────────
  async function updateUser(id, payload) {
    setError(''); setMessage('')
    try {
      await adminUpdateUser(id, payload)
      setMessage('User updated')
      await load()
      closeAction()
    } catch (err) {
      setError(err.response?.data?.message || 'Update failed')
    }
  }

  async function deleteUser(user) {
    if (!window.confirm(`Delete "${user.name}"? Their attendance records will also be removed.`)) return
    setError(''); setMessage('')
    try {
      await adminDeleteUser(user.id)
      setMessage(`User "${user.name}" deleted`)
      setActionOpenId(null)
      await load()
    } catch (err) {
      setError(err.response?.data?.message || 'Delete failed')
    }
  }

  async function handleResetFace(user) {
    setError(''); setMessage('')
    try {
      await resetFaceEnrollment(user.id)
      setMessage(`Face enrollment reset for ${user.name}`)
      closeAction()
      await load()
    } catch (err) {
      setError(err.response?.data?.message || 'Reset failed')
    }
  }

  function closeAction() {
    setActionUser(null); setActionType(''); setActionValue('')
    setScanStatus(''); setScanActive(false); setManualEntry(false)
    setAssignResult(null)
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
  }

  async function createUser(e) {
    e.preventDefault(); setError(''); setMessage('')
    try {
      await adminCreateUser(createForm)
      setCreateForm({ name: '', email: '', password: '', role: 'student', userId: '' })
      setCreateOpen(false); setMessage('User created'); await load()
    } catch (err) {
      setError(err.response?.data?.message || 'Create failed')
    }
  }

  // ─── Assign Students CSV handler ─────────────────────────────────────────
  async function handleAssignCsv(e) {
    const file = e.target.files?.[0]
    if (!file || !actionUser) return
    setAssignLoading(true); setAssignResult(null)
    try {
      const text = await file.text()
      const result = await assignStudentsCsv(actionUser.id, text)
      setAssignResult(result)
      await load()
    } catch (err) {
      setAssignResult({
        message: err.response?.data?.message || 'Assignment failed',
        assigned: 0, duplicates: 0, failed: 1,
        errors: [err.response?.data?.message || 'Unknown error']
      })
    } finally {
      setAssignLoading(false); e.target.value = ''
    }
  }

  // ─── Barcode scanner ──────────────────────────────────────────────────────
  async function startScanner() {
    if (actionType !== 'barcode' || !actionUser) return
    setScanStatus('Starting camera...'); setActionValue(''); setManualEntry(false)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      setScanStatus('Scanning barcode...'); setScanActive(true)
    } catch {
      setScanStatus('Camera not available. Use manual entry.'); setManualEntry(true); setScanActive(false)
    }
  }

  useEffect(() => {
    if (actionType === 'barcode') startScanner()
    return () => { setScanActive(false); if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop()) }
  }, [actionType, actionUser])

  useEffect(() => {
    let rafId
    async function scanLoop() {
      if (!scanActive) return
      const video = videoRef.current; const canvas = canvasRef.current
      if (video && canvas && video.readyState >= 2) {
        canvas.width = video.videoWidth; canvas.height = video.videoHeight
        const ctx = canvas.getContext('2d')
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        let decoded = ''
        if (detectorRef.current) {
          const barcodes = await detectorRef.current.detect(canvas)
          if (barcodes.length > 0) decoded = barcodes[0].rawValue || ''
        }
        if (!decoded) {
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
          const code = jsQR(imageData.data, imageData.width, imageData.height)
          decoded = code?.data || ''
        }
        if (decoded) {
          setActionValue(decoded.trim().toUpperCase())
          setScanStatus(`Detected: ${decoded.trim().toUpperCase()}`)
          setScanActive(false)
          if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
          return
        }
      }
      rafId = requestAnimationFrame(scanLoop)
    }
    if (scanActive) rafId = requestAnimationFrame(scanLoop)
    return () => { if (rafId) cancelAnimationFrame(rafId) }
  }, [scanActive])

  // ─── Bulk user CSV import ─────────────────────────────────────────────────
  async function handleCsvFile(e) {
    const file = e.target.files?.[0]; if (!file) return
    setCsvLoading(true); setCsvResult(null)
    try {
      const text = await file.text()
      const result = await adminCsvImport(text)
      setCsvResult(result); await load()
    } catch (err) {
      setCsvResult({ message: err.response?.data?.message || 'Import failed', created: 0, updated: 0, failed: 1, errors: [] })
    } finally { setCsvLoading(false); e.target.value = '' }
  }

  return (
    <div className="page">

      {/* ── Header ── */}
      <div className="section">
        <div className="section__header">
          <div>
            <h2>Admin Dashboard</h2>
            <p className="muted">Manage users, attendance, and face enrollments.</p>
          </div>
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <button className="btn btn--ghost" onClick={() => { setCsvOpen(v => !v); setCsvResult(null) }}>
              CSV Import
            </button>
            <button className="btn" onClick={() => setCreateOpen(true)}>Create User</button>
          </div>
        </div>
        {error && <div className="error">{error}</div>}
        {message && <div className="success">{message}</div>}
      </div>

      {/* ── CSV Import Panel ── */}
      {csvOpen && (
        <div className="card">
          <h3>CSV Bulk Import</h3>
          <p className="muted">
            Required columns: <code>name, email, password, userid, role</code><br />
            Existing emails are updated. Students require <code>userid</code>. Roles: student, teacher, admin, pending.
          </p>
          <input ref={csvInputRef} type="file" accept=".csv,text/csv" onChange={handleCsvFile} style={{ display: 'none' }} />
          <button className="btn" disabled={csvLoading} onClick={() => csvInputRef.current?.click()} style={{ marginTop: '0.8rem' }}>
            {csvLoading ? 'Importing...' : 'Choose CSV File'}
          </button>
          {csvResult && (
            <div style={{ marginTop: '1rem' }}>
              <div className={csvResult.failed > 0 ? 'error' : 'success'}>{csvResult.message}</div>
              <div className="stats-grid" style={{ marginTop: '0.8rem' }}>
                <div className="stat-card"><div className="stat-label">Created</div><div className="stat-value" style={{ color: '#15803d' }}>{csvResult.created}</div></div>
                <div className="stat-card"><div className="stat-label">Updated</div><div className="stat-value" style={{ color: '#1d4ed8' }}>{csvResult.updated}</div></div>
                <div className="stat-card"><div className="stat-label">Failed</div><div className="stat-value" style={{ color: '#b91c1c' }}>{csvResult.failed}</div></div>
              </div>
              {csvResult.errors?.length > 0 && csvResult.errors.map((e, i) => (
                <p key={i} className="error" style={{ marginTop: '0.3rem', fontSize: '0.85rem' }}>{e}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Overview Stats ── */}
      <div className="section">
        <div className="section__title"><h3>Overview</h3></div>
        <div className="stats-grid">
          {[
            { label: 'Total Users', value: stats.total },
            { label: 'Students', value: stats.students },
            { label: 'Teachers', value: stats.teachers },
            { label: 'Pending', value: stats.pending },
            { label: 'Face Enrolled', value: stats.enrolled },
            { label: "Today's Attendance", value: stats.todayCount },
            { label: 'Avg Attendance', value: `${stats.avgPct}%` }
          ].map(s => (
            <div key={s.label} className="stat-card">
              <div className="stat-label">{s.label}</div>
              <div className="stat-value">{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── User Management ── */}
      <div className="section">
        <div className="section__title"><h3>User Management</h3></div>
        <div className="filters" style={{ marginBottom: '1rem' }}>
          <label>
            Search
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Name, User ID, or email..." />
          </label>
          <label>
            Face Status
            <select value={faceFilter} onChange={e => setFaceFilter(e.target.value)}>
              <option value="all">All</option>
              <option value="enrolled">Face Enrolled</option>
              <option value="not_enrolled">Not Enrolled</option>
            </select>
          </label>
        </div>

        <div className="table table--users">
          <div className="table__row table__head">
            <span>Name</span><span>Email</span><span>Role</span><span>Status</span><span>Actions</span>
          </div>
          {filteredUsers.length === 0 && <p className="muted" style={{ paddingTop: '0.5rem' }}>No users match your search.</p>}
          {filteredUsers.map(user => (
            <div key={user.id} className="table__row">
              <span>
                <div className="cell-title">{user.name}</div>
                <div className="cell-meta">{user.userId || 'No User ID'}</div>
              </span>
              <span style={{ wordBreak: 'break-all', fontSize: '0.85rem' }}>{user.email || '-'}</span>
              <span className="pill pill--neutral">{user.role}</span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <span className={`pill ${user.role === 'pending' ? 'pill--warn' : 'pill--success'}`}>
                  {user.role === 'pending' ? 'Pending' : 'Active'}
                </span>
                <span className={`pill ${user.hasFace ? 'pill--info' : 'pill--neutral'}`}>
                  {user.hasFace ? 'Face ✓' : 'No Face'}
                </span>
              </span>
              <span className="action-cell">
                <button className="btn btn--ghost btn--icon" onClick={() => setActionOpenId(actionOpenId === user.id ? null : user.id)}>⋮</button>
                {actionOpenId === user.id && (
                  <div className="action-menu">
                    <button onClick={() => { setEnrollTarget(user); setActionOpenId(null) }}>Enroll Face</button>
                    {user.hasFace && <button onClick={() => { setActionUser(user); setActionType('resetFace'); setActionOpenId(null) }}>Reset Face</button>}
                    <button onClick={() => { setActionUser(user); setActionType('role'); setActionValue(user.role); setActionOpenId(null) }}>Change Role</button>
                    <button onClick={() => { setActionUser(user); setActionType('barcode'); setActionValue(user.barcode || ''); setActionOpenId(null) }}>Scan Barcode</button>
                    <button onClick={() => { setActionUser(user); setActionType('password'); setActionValue(''); setActionOpenId(null) }}>Set Password</button>
                    {user.role === 'teacher' && (
                      <button onClick={() => { setActionUser(user); setActionType('assign'); setAssignResult(null); setActionOpenId(null) }}>Assign Students</button>
                    )}
                    <button onClick={() => { setActionUser(user); setActionType('view'); setActionOpenId(null) }}>View IDs</button>
                    <button onClick={() => deleteUser(user)} style={{ color: '#dc2626' }}>Delete User</button>
                  </div>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Attendance Logs ── */}
      <div className="section">
        <div className="section__header">
          <div>
            <h3>Attendance Logs</h3>
            <p className="muted">All times in IST. Filter and export below.</p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button className="btn btn--ghost" onClick={() => exportAttendance('weekly')}>Export Weekly</button>
            <button className="btn btn--ghost" onClick={() => exportAttendance('monthly')}>Export Monthly</button>
            <button className="btn btn--ghost" onClick={() => exportAttendance('all')}>Export All</button>
          </div>
        </div>
        <div className="filters">
          <label>Date<input type="date" value={logFilters.date} onChange={e => { setLogFilters({ ...logFilters, date: e.target.value }); setLogPage(1) }} /></label>
          <label>Role
            <select value={logFilters.role} onChange={e => { setLogFilters({ ...logFilters, role: e.target.value }); setLogPage(1) }}>
              <option value="all">All</option>
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <label>Method
            <select value={logFilters.method} onChange={e => { setLogFilters({ ...logFilters, method: e.target.value }); setLogPage(1) }}>
              <option value="all">All</option>
              <option value="face">Face</option>
              <option value="barcode">Barcode</option>
            </select>
          </label>
        </div>
        <div className="table table--logs">
          <div className="table__row table__head">
            <span>Name</span><span>Role</span><span>Method</span><span>Date</span><span>Time (IST)</span>
          </div>
          {pagedLogs.map(log => (
            <div key={log.id} className="table__row">
              <span>
                <div className="cell-title">{log.name}</div>
                <div className="cell-meta">{log.userIdText || '-'}</div>
              </span>
              <span className="pill pill--neutral">{log.role}</span>
              <span className="pill pill--info">{log.method}</span>
              <span>{log.date}</span>
              <span>{log.time}</span>
            </div>
          ))}
        </div>
        <div className="pagination">
          <button className="btn btn--ghost" disabled={logPage === 1} onClick={() => setLogPage(p => p - 1)}>Prev</button>
          <span className="muted">Page {logPage} of {totalPages}</span>
          <button className="btn btn--ghost" disabled={logPage === totalPages} onClick={() => setLogPage(p => p + 1)}>Next</button>
        </div>
      </div>

      {/* ── Face Enrollment Modal ── */}
      {enrollTarget && (
        <FaceEnrollModal
          targetUser={enrollTarget}
          onSuccess={() => { setMessage(`Face enrolled for ${enrollTarget.name}`); setEnrollTarget(null); load() }}
          onClose={() => setEnrollTarget(null)}
        />
      )}

      {/* ── Create User Modal ── */}
      {createOpen && (
        <Modal title="Create User" onClose={() => setCreateOpen(false)}>
          <form onSubmit={createUser} className="form grid-2">
            <label>Name<input value={createForm.name} onChange={e => setCreateForm({ ...createForm, name: e.target.value })} required /></label>
            <label>Email<input type="email" value={createForm.email} onChange={e => setCreateForm({ ...createForm, email: e.target.value })} required /></label>
            <label>User ID (USN)<input value={createForm.userId} onChange={e => setCreateForm({ ...createForm, userId: e.target.value.toUpperCase() })} placeholder="e.g. 1RV20CS001" required={createForm.role === 'student'} /></label>
            <label>Password<input type="password" value={createForm.password} onChange={e => setCreateForm({ ...createForm, password: e.target.value })} required /></label>
            <label>Role
              <select value={createForm.role} onChange={e => setCreateForm({ ...createForm, role: e.target.value })}>
                <option value="student">Student</option>
                <option value="teacher">Teacher</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <div className="modal__actions">
              <button type="button" className="btn btn--ghost" onClick={() => setCreateOpen(false)}>Cancel</button>
              <button className="btn">Create</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Action Modals ── */}
      {actionUser && (
        <Modal title={`${actionType === 'resetFace' ? 'Reset Face' : 'Actions'} — ${actionUser.name}`} onClose={closeAction}>
          {actionType === 'view' && (
            <div className="stack">
              <div className="muted">Database ID</div><div className="mono">{actionUser.id}</div>
              <div className="muted">User ID (USN)</div><div className="mono">{actionUser.userId || '—'}</div>
              <div className="muted">Barcode</div><div className="mono">{actionUser.barcode || '—'}</div>
            </div>
          )}
          {actionType === 'role' && (
            <div className="stack">
              <label>Role
                <select value={actionValue} onChange={e => setActionValue(e.target.value)}>
                  <option value="pending">pending</option>
                  <option value="student">student</option>
                  <option value="teacher">teacher</option>
                  <option value="admin">admin</option>
                </select>
              </label>
              <p className="muted">Role changes take effect immediately.</p>
              <div className="modal__actions">
                <button className="btn btn--ghost" onClick={closeAction}>Cancel</button>
                <button className="btn" onClick={() => updateUser(actionUser.id, { role: actionValue })}>Confirm</button>
              </div>
            </div>
          )}
          {actionType === 'barcode' && (
            <div className="stack">
              <div className="video-box"><video ref={videoRef} autoPlay muted playsInline /><canvas ref={canvasRef} className="hidden-canvas" /></div>
              <p className="muted">{scanStatus || 'Point camera at the barcode.'}</p>
              {manualEntry && (
                <label>Manual Entry<input value={actionValue} onChange={e => setActionValue(e.target.value.toUpperCase())} placeholder="Enter USN" /></label>
              )}
              <div className="modal__actions">
                <button className="btn btn--ghost" onClick={() => { setManualEntry(v => !v); setScanActive(false) }}>{manualEntry ? 'Hide Manual' : 'Manual Entry'}</button>
                <button className="btn btn--ghost" onClick={() => startScanner()}>Rescan</button>
              </div>
              <div className="modal__actions">
                <button className="btn btn--ghost" onClick={closeAction}>Cancel</button>
                <button className="btn" disabled={!actionValue} onClick={() => updateUser(actionUser.id, { barcode: actionValue.toUpperCase() })}>Save Barcode</button>
              </div>
            </div>
          )}
          {actionType === 'password' && (
            <div className="stack">
              <label>New Password<input type="password" value={actionValue} onChange={e => setActionValue(e.target.value)} placeholder="Enter new password" /></label>
              <div className="modal__actions">
                <button className="btn btn--ghost" onClick={closeAction}>Cancel</button>
                <button className="btn" onClick={() => updateUser(actionUser.id, { password: actionValue })}>Set Password</button>
              </div>
            </div>
          )}
          {actionType === 'assign' && (
            <div className="stack">
              <h4 style={{ margin: 0 }}>Assign Students via CSV</h4>
              <p className="muted">
                Upload a CSV with student User IDs. Format:<br />
                <code>name,userid</code> (header optional, <code>userid</code> column required)<br />
                Example: <code>Ankit Kumar,23BTRCA006</code><br />
                Students are appended to existing assignments.
              </p>
              <input
                ref={assignCsvRef}
                type="file"
                accept=".csv,text/csv"
                style={{ display: 'none' }}
                onChange={handleAssignCsv}
              />
              <button
                className="btn"
                disabled={assignLoading}
                onClick={() => assignCsvRef.current?.click()}
              >
                {assignLoading ? 'Assigning...' : 'Choose CSV File'}
              </button>
              {assignResult && (
                <div>
                  <div className={assignResult.failed > 0 ? 'error' : 'success'}>{assignResult.message}</div>
                  {assignResult.errors?.length > 0 && assignResult.errors.map((e, i) => (
                    <p key={i} className="muted" style={{ fontSize: '0.85rem', marginTop: '0.2rem' }}>{e}</p>
                  ))}
                </div>
              )}
              <div className="modal__actions">
                <button className="btn btn--ghost" onClick={closeAction}>Close</button>
              </div>
            </div>
          )}
          {actionType === 'resetFace' && (
            <div className="stack">
              <p>Permanently remove the face enrollment for <strong>{actionUser.name}</strong>. They will need to be re-enrolled by an admin or teacher.</p>
              <div className="modal__actions">
                <button className="btn btn--ghost" onClick={closeAction}>Cancel</button>
                <button className="btn" style={{ background: '#dc2626' }} onClick={() => handleResetFace(actionUser)}>Confirm Reset</button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}

function Modal({ title, children, onClose }) {
  return (
    <div className="modal">
      <div className="modal__backdrop" onClick={onClose} />
      <div className="modal__content">
        <div className="modal__header">
          <h4>{title}</h4>
          <button className="btn btn--ghost btn--icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal__body">{children}</div>
      </div>
    </div>
  )
}
