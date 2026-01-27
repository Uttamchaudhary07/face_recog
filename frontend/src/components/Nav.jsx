import React from 'react'
import { Link } from 'react-router-dom'

export default function Nav({ user, onLogout }){
  return (
    <header className="nav">
      <div className="nav__brand">
        <span className="nav__logo">🎓</span>
        <span>Smart Attendance</span>
      </div>
      <nav className="nav__links">
        <Link to="/">Attendance</Link>
        {!user && <Link to="/signup">Signup</Link>}
        {!user && <Link to="/login">Login</Link>}
        {user?.role === 'admin' && <Link to="/admin">Admin</Link>}
        {user?.role === 'teacher' && <Link to="/teacher">Teacher</Link>}
        {user?.role === 'student' && <Link to="/student">Student</Link>}
        {user && (
          <button className="btn btn--ghost" onClick={onLogout}>Logout</button>
        )}
      </nav>
    </header>
  )
}
