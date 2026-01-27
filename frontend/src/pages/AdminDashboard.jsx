import React, { useEffect, useMemo, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { adminListUsers, adminUpdateUser, adminCreateUser, adminAttendance } from '../api'

export default function AdminDashboard(){
  const [users, setUsers] = useState([])
  const [logs, setLogs] = useState([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [createForm, setCreateForm] = useState({ name: '', email: '', password: '', role: 'student', userId: '' })
  const [createOpen, setCreateOpen] = useState(false)
  const [actionUser, setActionUser] = useState(null)
  const [actionType, setActionType] = useState('')
  const [actionValue, setActionValue] = useState('')
  const [actionOpenId, setActionOpenId] = useState(null)
  const [scanStatus, setScanStatus] = useState('')
  const [scanActive, setScanActive] = useState(false)
  const [manualEntry, setManualEntry] = useState(false)
  const [logFilters, setLogFilters] = useState({ date: '', role: 'all', method: 'all' })
  const [logPage, setLogPage] = useState(1)
  const PAGE_SIZE = 10
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const detectorRef = useRef(null)

  async function load(){
    try {
      const data = await adminListUsers()
      setUsers(data)
      const logData = await adminAttendance()
      setLogs(logData)
    } catch (err){
      setError(err.response?.data?.message || 'Failed to load data')
    }
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if ('BarcodeDetector' in window){
      detectorRef.current = new BarcodeDetector({
        formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e']
      })
    }
  }, [])

  async function updateUser(id, payload){
    setError('')
    setMessage('')
    try {
      await adminUpdateUser(id, payload)
      setMessage('User updated')
      await load()
      setActionUser(null)
      setActionType('')
      setActionValue('')
    } catch (err){
      setError(err.response?.data?.message || 'Update failed')
    }
  }

  async function createUser(e){
    e.preventDefault()
    setError('')
    setMessage('')
    try {
      await adminCreateUser(createForm)
      setCreateForm({ name: '', email: '', password: '', role: 'student', userId: '' })
      setCreateOpen(false)
      setMessage('User created')
      await load()
    } catch (err){
      setError(err.response?.data?.message || 'Create failed')
    }
  }

  const stats = useMemo(() => {
    const total = users.length
    const students = users.filter((u) => u.role === 'student').length
    const teachers = users.filter((u) => u.role === 'teacher').length
    const pending = users.filter((u) => u.role === 'pending').length
    const today = new Date().toISOString().slice(0, 10)
    const todayCount = logs.filter((log) => log.date === today).length
    return { total, students, teachers, pending, todayCount }
  }, [users, logs])

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (logFilters.date && log.date !== logFilters.date) return false
      if (logFilters.role !== 'all' && log.role !== logFilters.role) return false
      if (logFilters.method !== 'all' && log.method !== logFilters.method) return false
      return true
    })
  }, [logs, logFilters])

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE))
  const pagedLogs = filteredLogs.slice((logPage - 1) * PAGE_SIZE, logPage * PAGE_SIZE)

  useEffect(() => {
    if (logPage > totalPages) setLogPage(totalPages)
  }, [logPage, totalPages])

  async function startScanner(){
    if (actionType !== 'barcode' || !actionUser) return
    setScanStatus('Starting camera...')
    setActionValue('')
    setManualEntry(false)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      streamRef.current = stream
      if (videoRef.current){
        videoRef.current.srcObject = stream
      }
      setScanStatus('Scanning barcode...')
      setScanActive(true)
    } catch (err){
      setScanStatus('Camera not available. Use manual entry.')
      setManualEntry(true)
      setScanActive(false)
    }
  }

  useEffect(() => {
    startScanner()

    return () => {
      setScanActive(false)
      if (streamRef.current){
        streamRef.current.getTracks().forEach((track) => track.stop())
      }
    }
  }, [actionType, actionUser])

  useEffect(() => {
    let rafId
    async function scanLoop(){
      if (!scanActive) return
      const video = videoRef.current
      const canvas = canvasRef.current
      if (video && canvas && video.readyState >= 2){
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const ctx = canvas.getContext('2d')
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        let decoded = ''
        if (detectorRef.current){
          const barcodes = await detectorRef.current.detect(canvas)
          if (barcodes.length > 0){
            decoded = barcodes[0].rawValue || ''
          }
        }
        if (!decoded){
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
          const code = jsQR(imageData.data, imageData.width, imageData.height)
          decoded = code?.data || ''
        }
        if (decoded){
          const normalized = decoded.trim().toUpperCase()
          setActionValue(normalized)
          setScanStatus(`Detected USN: ${normalized}`)
          setScanActive(false)
          if (streamRef.current){
            streamRef.current.getTracks().forEach((track) => track.stop())
          }
          return
        }
      }
      rafId = requestAnimationFrame(scanLoop)
    }

    if (scanActive){
      rafId = requestAnimationFrame(scanLoop)
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [scanActive])

  return (
    <div className="page">
      <div className="section">
        <div className="section__header">
          <div>
            <h2>Admin Dashboard</h2>
            <p className="muted">Manage users and attendance at a glance.</p>
          </div>
          <button className="btn" onClick={() => setCreateOpen(true)}>Create User</button>
        </div>
        {error && <div className="error">{error}</div>}
        {message && <div className="success">{message}</div>}
      </div>

      <div className="section">
        <div className="section__title">
          <h3>Overview</h3>
        </div>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Total Users</div>
            <div className="stat-value">{stats.total}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Students</div>
            <div className="stat-value">{stats.students}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Teachers</div>
            <div className="stat-value">{stats.teachers}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Pending</div>
            <div className="stat-value">{stats.pending}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Today&apos;s Attendance</div>
            <div className="stat-value">{stats.todayCount}</div>
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section__title">
          <h3>User Management</h3>
          <p className="muted">Essential details only. Use Actions for advanced operations.</p>
        </div>
        <div className="table table--users">
          <div className="table__row table__head">
            <span>Name</span>
            <span>Email</span>
            <span>Role</span>
            <span>Status</span>
            <span>Actions</span>
          </div>
          {users.map((user) => (
            <div key={user._id} className="table__row">
              <span>
                <div className="cell-title">{user.name}</div>
                <div className="cell-meta">{user.userId || 'No User ID'}</div>
              </span>
              <span>{user.email || '-'}</span>
              <span className="pill pill--neutral">{user.role}</span>
              <span className={`pill ${user.role === 'pending' ? 'pill--warn' : 'pill--success'}`}>
                {user.role === 'pending' ? 'Pending' : 'Active'}
              </span>
              <span className="action-cell">
                <button
                  className="btn btn--ghost btn--icon"
                  onClick={() => setActionOpenId(actionOpenId === user._id ? null : user._id)}
                >
                  ⋮
                </button>
                {actionOpenId === user._id && (
                  <div className="action-menu">
                    <button onClick={() => { setActionUser(user); setActionType('role'); setActionValue(user.role); setActionOpenId(null) }}>Change Role</button>
                    <button onClick={() => { setActionUser(user); setActionType('barcode'); setActionValue(user.barcode || ''); setActionOpenId(null) }}>Scan Barcode</button>
                    <button onClick={() => { setActionUser(user); setActionType('password'); setActionValue(''); setActionOpenId(null) }}>Set Password</button>
                    {user.role === 'teacher' && (
                      <button onClick={() => { setActionUser(user); setActionType('assign'); setActionValue(user.assignedStudents?.map(s => s._id).join(',') || ''); setActionOpenId(null) }}>
                        Assign Students
                      </button>
                    )}
                    <button onClick={() => { setActionUser(user); setActionType('view'); setActionValue(''); setActionOpenId(null) }}>View IDs</button>
                  </div>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="section">
        <div className="section__title">
          <h3>Attendance Logs</h3>
          <p className="muted">Filter by date, role, or method.</p>
        </div>
        <div className="filters">
          <label>
            Date
            <input
              type="date"
              value={logFilters.date}
              onChange={(e) => { setLogFilters({ ...logFilters, date: e.target.value }); setLogPage(1) }}
            />
          </label>
          <label>
            Role
            <select
              value={logFilters.role}
              onChange={(e) => { setLogFilters({ ...logFilters, role: e.target.value }); setLogPage(1) }}
            >
              <option value="all">All</option>
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <label>
            Method
            <select
              value={logFilters.method}
              onChange={(e) => { setLogFilters({ ...logFilters, method: e.target.value }); setLogPage(1) }}
            >
              <option value="all">All</option>
              <option value="face">Face</option>
              <option value="barcode">Barcode</option>
            </select>
          </label>
        </div>
        <div className="table table--logs">
          <div className="table__row table__head">
            <span>Name</span>
            <span>Role</span>
            <span>Method</span>
            <span>Date</span>
            <span>Time</span>
          </div>
          {pagedLogs.map((log) => (
            <div key={log._id} className="table__row">
              <span>
                <div className="cell-title">{log.name}</div>
                <div className="cell-meta">{log.userId || 'No User ID'}</div>
              </span>
              <span className="pill pill--neutral">{log.role}</span>
              <span className="pill pill--info">{log.method}</span>
              <span>{log.date}</span>
              <span>{log.time}</span>
            </div>
          ))}
        </div>
        <div className="pagination">
          <button className="btn btn--ghost" disabled={logPage === 1} onClick={() => setLogPage((p) => Math.max(1, p - 1))}>Prev</button>
          <span className="muted">Page {logPage} of {totalPages}</span>
          <button className="btn btn--ghost" disabled={logPage === totalPages} onClick={() => setLogPage((p) => Math.min(totalPages, p + 1))}>Next</button>
        </div>
      </div>

      {createOpen && (
        <Modal title="Create User" onClose={() => setCreateOpen(false)}>
          <form onSubmit={createUser} className="form grid-2">
            <label>
              Name
              <input value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} required />
            </label>
            <label>
              Email
              <input type="email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} required />
            </label>
            <label>
              User ID (USN)
              <input
                value={createForm.userId}
                onChange={(e) => setCreateForm({ ...createForm, userId: e.target.value.toUpperCase() })}
                placeholder="E.g. 1RV20CS001"
                required={createForm.role === 'student'}
              />
            </label>
            <label>
              Password
              <input type="password" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} required />
            </label>
            <label>
              Role
              <select value={createForm.role} onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}>
                <option value="student">Student</option>
                <option value="teacher">Teacher</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <div className="modal__actions">
              <button type="button" className="btn btn--ghost" onClick={() => setCreateOpen(false)}>Cancel</button>
              <button className="btn">Create User</button>
            </div>
          </form>
        </Modal>
      )}

      {actionUser && (
        <Modal
          title={`Actions for ${actionUser.name}`}
          onClose={() => {
            setActionUser(null)
            setActionType('')
            setActionValue('')
            setScanStatus('')
            setScanActive(false)
            setManualEntry(false)
          }}
        >
          {actionType === 'view' && (
            <div className="stack">
              <div className="muted">Database ID</div>
              <div className="mono">{actionUser._id}</div>
              <div className="muted">User ID</div>
              <div className="mono">{actionUser.userId || '-'}</div>
              <div className="muted">Barcode</div>
              <div className="mono">{actionUser.barcode || '-'}</div>
            </div>
          )}
          {actionType === 'role' && (
            <div className="stack">
              <label>
                Role
                <select value={actionValue} onChange={(e) => setActionValue(e.target.value)}>
                  <option value="pending">pending</option>
                  <option value="student">student</option>
                  <option value="teacher">teacher</option>
                  <option value="admin">admin</option>
                </select>
              </label>
              <p className="muted">Role changes affect access immediately.</p>
              <div className="modal__actions">
                <button className="btn btn--ghost" onClick={() => { setActionUser(null); setActionType(''); setActionValue('') }}>Cancel</button>
                <button className="btn" onClick={() => updateUser(actionUser._id, { role: actionValue })}>Confirm Role</button>
              </div>
            </div>
          )}
          {actionType === 'barcode' && (
            <div className="stack">
              <div className="video-box">
                <video ref={videoRef} autoPlay muted playsInline />
                <canvas ref={canvasRef} className="hidden-canvas" />
              </div>
              <p className="muted">{scanStatus || 'Point the camera at the barcode.'}</p>
              {manualEntry && (
                <label>
                  Manual USN Entry (fallback)
                  <input
                    value={actionValue}
                    onChange={(e) => setActionValue(e.target.value.toUpperCase())}
                    placeholder="Enter USN"
                  />
                </label>
              )}
              <div className="modal__actions">
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => {
                    setManualEntry((v) => !v)
                    setScanActive(false)
                    if (streamRef.current){
                      streamRef.current.getTracks().forEach((track) => track.stop())
                    }
                  }}
                >
                  {manualEntry ? 'Hide Manual' : 'Manual Entry'}
                </button>
                <button type="button" className="btn btn--ghost" onClick={() => startScanner()}>
                  Rescan
                </button>
              </div>
              <div className="modal__actions">
                <button className="btn btn--ghost" onClick={() => { setActionUser(null); setActionType(''); setActionValue('') }}>Cancel</button>
                <button
                  className="btn"
                  onClick={() => updateUser(actionUser._id, { barcode: actionValue ? actionValue.toUpperCase() : undefined })}
                  disabled={!actionValue}
                >
                  Save USN
                </button>
              </div>
            </div>
          )}
          {actionType === 'password' && (
            <div className="stack">
              <label>
                New Password
                <input type="password" value={actionValue} onChange={(e) => setActionValue(e.target.value)} placeholder="Enter new password" />
              </label>
              <div className="modal__actions">
                <button className="btn btn--ghost" onClick={() => { setActionUser(null); setActionType(''); setActionValue('') }}>Cancel</button>
                <button className="btn" onClick={() => updateUser(actionUser._id, { password: actionValue || undefined })}>Set Password</button>
              </div>
            </div>
          )}
          {actionType === 'assign' && (
            <div className="stack">
              <label>
                Assign Student IDs (comma separated)
                <input value={actionValue} onChange={(e) => setActionValue(e.target.value)} placeholder="ObjectId, ObjectId, ..." />
              </label>
              <div className="modal__actions">
                <button className="btn btn--ghost" onClick={() => { setActionUser(null); setActionType(''); setActionValue('') }}>Cancel</button>
                <button
                  className="btn"
                  onClick={() => updateUser(actionUser._id, { assignedStudents: actionValue.split(',').map(s => s.trim()).filter(Boolean) })}
                >
                  Save Assignments
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}

function Modal({ title, children, onClose }){
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
