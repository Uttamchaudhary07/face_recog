import axios from 'axios'

const API_ROOT = import.meta.env.VITE_API_ROOT || 'http://localhost:5001/api'

export const api = axios.create({
  baseURL: API_ROOT,
  timeout: 15000
})

export function setAuthToken(token){
  if (token){
    api.defaults.headers.common.Authorization = `Bearer ${token}`
  } else {
    delete api.defaults.headers.common.Authorization
  }
}

export async function signup(payload){
  const res = await api.post('/auth/signup', payload)
  return res.data
}

export async function login(payload){
  const res = await api.post('/auth/login', payload)
  return res.data
}

export async function getMe(){
  const res = await api.get('/auth/me')
  return res.data
}

export async function adminListUsers(role){
  const res = await api.get('/admin/users', { params: role ? { role } : undefined })
  return res.data
}

export async function adminUpdateUser(id, payload){
  const res = await api.patch(`/admin/users/${id}`, payload)
  return res.data
}

export async function adminCreateUser(payload){
  const res = await api.post('/admin/users', payload)
  return res.data
}

export async function adminAttendance(){
  const res = await api.get('/admin/attendance')
  return res.data
}

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

export async function enrollFace(descriptors){
  const res = await api.post('/attendance/face/enroll', { descriptors })
  return res.data
}

export async function getFaceDescriptors(){
  const res = await api.get('/attendance/face/descriptors')
  return res.data
}
