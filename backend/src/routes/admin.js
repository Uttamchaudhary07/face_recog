import express from 'express'
import bcrypt from 'bcryptjs'
import { User } from '../models/User.js'
import { Attendance } from '../models/Attendance.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const router = express.Router()

router.use(requireAuth, requireRole('admin'))

router.get('/users', async (req, res) => {
  const role = req.query.role
  const query = role ? { role } : {}
  const users = await User.find(query).populate('assignedStudents', 'name userId')
  return res.json(users)
})

router.post('/users', async (req, res) => {
  try {
    const { name, email, password, role, userId, barcode } = req.body
    if (!name || !email || !password || !role){
      return res.status(400).json({ message: 'Name, email, password, and role required' })
    }
    if (role === 'student' && !userId){
      return res.status(400).json({ message: 'Student userId (USN) is required' })
    }
    const passwordHash = await bcrypt.hash(password, 10)
    const user = await User.create({
      name,
      email: email.toLowerCase(),
      passwordHash,
      role,
      userId: userId ? userId.toUpperCase() : undefined,
      barcode: barcode ? barcode.toUpperCase() : undefined
    })
    return res.status(201).json(user)
  } catch (err){
    return res.status(500).json({ message: 'Server error', error: err.message })
  }
})

router.patch('/users/:id', async (req, res) => {
  try {
    const { role, assignedStudents, subjects, barcode, userId, name, email, password } = req.body
    const existing = await User.findById(req.params.id)
    if (!existing) return res.status(404).json({ message: 'User not found' })
    if (userId && existing.userId && userId.toUpperCase() !== existing.userId.toUpperCase()){
      return res.status(400).json({ message: 'userId is immutable once set' })
    }
    const update = {}
    if (role) update.role = role
    if (role === 'student' && !existing.userId && !userId){
      return res.status(400).json({ message: 'Student userId (USN) is required' })
    }
    if (Array.isArray(assignedStudents)) update.assignedStudents = assignedStudents
    if (Array.isArray(subjects)) update.subjects = subjects
    if (barcode !== undefined) update.barcode = barcode ? barcode.toUpperCase() : undefined
    if (userId !== undefined && !existing.userId) update.userId = userId ? userId.toUpperCase() : undefined
    if (name) update.name = name
    if (email) update.email = email.toLowerCase()
    if (password) update.passwordHash = await bcrypt.hash(password, 10)

    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true })
    return res.json(user)
  } catch (err){
    return res.status(500).json({ message: 'Server error', error: err.message })
  }
})

router.get('/attendance', async (req, res) => {
  const logs = await Attendance.find().sort({ timestamp: -1 }).limit(1000)
  return res.json(logs)
})

export default router
