import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signup } from '../api'

export default function Signup(){
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '', userId: '' })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function update(field){
    return (e) => {
      const value = field === 'userId' ? e.target.value.toUpperCase() : e.target.value
      setForm({ ...form, [field]: value })
    }
  }

  async function submit(e){
    e.preventDefault()
    setMessage('')
    setError('')
    setLoading(true)
    try {
      const data = await signup(form)
      setMessage(data.message)
      setTimeout(() => navigate('/'), 1200)
    } catch (err){
      setError(err.response?.data?.message || 'Signup failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page">
      <div className="card">
        <h2>Create Account</h2>
        <p className="muted">Your account will be pending until an admin assigns a role.</p>
        <form onSubmit={submit} className="form">
          <label>
            Full name
            <input value={form.name} onChange={update('name')} required />
          </label>
          <label>
            Email
            <input type="email" value={form.email} onChange={update('email')} required />
          </label>
          <label>
            Password
            <input type="password" value={form.password} onChange={update('password')} required />
          </label>
          <label>
            User ID (optional)
            <input value={form.userId} onChange={update('userId')} />
          </label>
          {message && <div className="success">{message}</div>}
          {error && <div className="error">{error}</div>}
          <button className="btn" disabled={loading}>{loading ? 'Submitting...' : 'Signup'}</button>
        </form>
      </div>
    </div>
  )
}
