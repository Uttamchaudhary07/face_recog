import axios from 'axios'

const API_ROOT = import.meta.env.VITE_API_ROOT || (import.meta.env.PROD ? '/api' : 'http://localhost:5001/api')

export const api = axios.create({
  baseURL: API_ROOT,
  timeout: 20000
})

export function setAuthToken(token){
  if (token){
    api.defaults.headers.common.Authorization = `Bearer ${token}`
  } else {
    delete api.defaults.headers.common.Authorization
  }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
export async function login(payload){
  const res = await api.post('/auth/login', payload)
  return res.data
}

export async function getMe(){
  const res = await api.get('/auth/me')
  return res.data
}

// ─── Admin ────────────────────────────────────────────────────────────────────
export async function adminListUsers(role){
  const res = await api.get('/admin/users', { params: role ? { role } : undefined })
  return res.data
}

export async function adminCreateUser(payload){
  const res = await api.post('/admin/users', payload)
  return res.data
}

export async function adminUpdateUser(id, payload){
  const res = await api.patch(`/admin/users/${id}`, payload)
  return res.data
}

export async function adminDeleteUser(id){
  const res = await api.delete(`/admin/users/${id}`)
  return res.data
}

export async function adminAttendance(){
  const res = await api.get('/admin/attendance')
  return res.data
}

export async function adminCsvImport(csvText){
  const res = await api.post('/admin/csv-import', { csv: csvText })
  return res.data
}

// ─── Attendance ───────────────────────────────────────────────────────────────
export async function getAttendanceSessions(){
  const res = await api.get('/attendance/sessions')
  return res.data
}

export async function startAttendanceSession(subject, durationMinutes){
  const res = await api.post('/attendance/sessions', { subject, durationMinutes })
  return res.data
}

export async function closeAttendanceSession(id){
  const res = await api.patch(`/attendance/sessions/${id}/close`)
  return res.data
}

export async function markByFace(descriptors, qualities, sessionCode){
  const res = await api.post('/attendance/face/verify', { descriptors, qualities, sessionCode })
  return res.data
}

export async function markByBarcode(barcode, sessionCode){
  const res = await api.post('/attendance/barcode', { barcode, sessionCode })
  return res.data
}

export async function getLogs(){
  const res = await api.get('/attendance/logs')
  return res.data
}

// Admin or Teacher enrolls a face for a specific target user
export async function enrollStudentFace(targetUserId, descriptors){
  const res = await api.post(`/attendance/face/enroll/${targetUserId}`, { descriptors })
  return res.data
}

export async function resetFaceEnrollment(userId){
  const res = await api.delete(`/attendance/face/enroll/${userId}`)
  return res.data
}

export async function getMyStudents(){
  const res = await api.get('/attendance/my-students')
  return res.data
}

export async function getAttendanceReports(){
  const res = await api.get('/attendance/reports')
  return res.data
}

export async function getBiometricAudit(){
  const res = await api.get('/admin/biometric-audit')
  return res.data
}

export async function assignStudentsCsv(teacherId, csvText){
  const res = await api.post('/admin/assign-students-csv', { teacherId, csv: csvText })
  return res.data
}
