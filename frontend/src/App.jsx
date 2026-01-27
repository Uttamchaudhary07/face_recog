import React, { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { getMe, setAuthToken } from './api'
import Nav from './components/Nav.jsx'
import Login from './pages/Login.jsx'
import Signup from './pages/Signup.jsx'
import AttendanceKiosk from './pages/AttendanceKiosk.jsx'
import AdminDashboard from './pages/AdminDashboard.jsx'
import TeacherDashboard from './pages/TeacherDashboard.jsx'
import StudentDashboard from './pages/StudentDashboard.jsx'

function RequireAuth({ user, children }){
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App(){
  const [token, setToken] = useState(localStorage.getItem('token'))
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (token){
      setAuthToken(token)
      getMe()
        .then(setUser)
        .catch(() => {
          localStorage.removeItem('token')
          setToken(null)
          setUser(null)
        })
        .finally(() => setLoading(false))
    } else {
      setAuthToken(null)
      setLoading(false)
    }
  }, [token])

  function handleLogin(nextToken, userData){
    localStorage.setItem('token', nextToken)
    setToken(nextToken)
    setUser(userData)
  }

  function handleLogout(){
    localStorage.removeItem('token')
    setToken(null)
    setUser(null)
  }

  if (loading) return <div className="page"><p>Loading...</p></div>

  return (
    <BrowserRouter>
      <Nav user={user} onLogout={handleLogout} />
      <Routes>
        <Route path="/" element={<AttendanceKiosk />} />
        <Route path="/login" element={<Login onLogin={handleLogin} />} />
        <Route path="/signup" element={<Signup />} />
        <Route
          path="/admin"
          element={
            <RequireAuth user={user}>
              {user?.role === 'admin' ? <AdminDashboard /> : <Navigate to="/" replace />}
            </RequireAuth>
          }
        />
        <Route
          path="/teacher"
          element={
            <RequireAuth user={user}>
              {user?.role === 'teacher' ? <TeacherDashboard /> : <Navigate to="/" replace />}
            </RequireAuth>
          }
        />
        <Route
          path="/student"
          element={
            <RequireAuth user={user}>
              {user?.role === 'student' ? <StudentDashboard /> : <Navigate to="/" replace />}
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
