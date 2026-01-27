import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../api'

export default function Login({ onLogin }){
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e){
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await login({ email, password })
      onLogin(data.token, data.user)
      if (data.user?.role === 'admin') navigate('/admin')
      else if (data.user?.role === 'teacher') navigate('/teacher')
      else if (data.user?.role === 'student') navigate('/student')
      else navigate('/')
    } catch (err){
      setError(err.response?.data?.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page">
      <div className="card">
        <h2>Login</h2>
        <form onSubmit={submit} className="form">
          <label>
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          </label>
          <label>
            Password
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
          </label>
          {error && <div className="error">{error}</div>}
          <button className="btn" disabled={loading}>{loading ? 'Signing in...' : 'Login'}</button>
        </form>
      </div>
    </div>
  )
}
