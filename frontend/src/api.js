import axios from 'axios'

const API_ROOT = import.meta.env.VITE_API_ROOT || 'http://localhost:5001/api'

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

// Log every backend request/response to Chrome DevTools console
api.interceptors.request.use(req => {
  console.log(`[API →] ${req.method?.toUpperCase()} ${req.baseURL}${req.url}`, req.data ?? '')
  return req
})
api.interceptors.response.use(
  res => {
    console.log(`[API ←] ${res.status} ${res.config.url}`, res.data)
    return res
  },
  err => {
    const status = err.response?.status ?? 'ERR'
    const data   = err.response?.data ?? err.message
    console.error(`[API ✗] ${status} ${err.config?.url}`, data)
    return Promise.reject(err)
  }
)

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
export async function markByFace(descriptor){
  const res = await api.post('/attendance/face/verify', { descriptor })
  return res.data
}

export async function markByBarcode(barcode){
  const res = await api.post('/attendance/barcode', { barcode })
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

export async function getFaceDescriptors(){
  const res = await api.get('/attendance/face/descriptors')
  return res.data
}

export async function assignStudentsCsv(teacherId, csvText){
  const res = await api.post('/admin/assign-students-csv', { teacherId, csv: csvText })
  return res.data
}
