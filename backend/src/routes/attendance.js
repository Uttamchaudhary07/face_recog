import express from 'express'
import { User } from '../models/User.js'
import { Attendance } from '../models/Attendance.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { euclideanDistance, averageDescriptors } from '../utils/face.js'

const router = express.Router()

function nowStrings(){
  const now = new Date()
  const date = now.toISOString().slice(0, 10)
  const time = now.toTimeString().slice(0, 8)
  return { now, date, time }
}

router.post('/face/verify', async (req, res) => {
  try {
    const { descriptor } = req.body
    if (!Array.isArray(descriptor) || descriptor.length === 0){
      return res.status(400).json({ message: 'Descriptor required' })
    }

    const users = await User.find({ role: { $ne: 'pending' }, faceDescriptor: { $exists: true } })
    let best = null
    let bestDistance = Number.POSITIVE_INFINITY

    for (const user of users){
      const distance = euclideanDistance(descriptor, user.faceDescriptor)
      if (distance < bestDistance){
        bestDistance = distance
        best = user
      }
    }

    const threshold = 0.55
    if (!best || bestDistance > threshold){
      return res.status(404).json({ status: 'not_found', message: 'Face not recognized' })
    }
    if (!best.userId){
      return res.status(400).json({ message: 'User does not have a valid userId' })
    }

    const { now, date, time } = nowStrings()
    const existing = await Attendance.findOne({ user: best._id, date })
    if (!existing){
      await Attendance.create({
        user: best._id,
        name: best.name,
        userId: best.userId,
        role: best.role,
        method: 'face',
        status: 'present',
        timestamp: now,
        date,
        time
      })
    }

    return res.json({ status: 'marked', user: { id: best._id, name: best.name, userId: best.userId }, distance: bestDistance })
  } catch (err){
    return res.status(500).json({ message: 'Server error', error: err.message })
  }
})

router.post('/face/enroll', requireAuth, requireRole('student'), async (req, res) => {
  try {
    const { descriptors } = req.body
    if (!Array.isArray(descriptors) || descriptors.length < 5){
      return res.status(400).json({ message: 'Provide at least 5 face descriptors' })
    }

    const user = await User.findById(req.user.id)
    if (!user) return res.status(404).json({ message: 'User not found' })
    if (user.role === 'pending') return res.status(403).json({ message: 'Account pending admin approval' })

    const averaged = averageDescriptors(descriptors)
    if (!averaged) return res.status(400).json({ message: 'Invalid descriptors' })

    user.faceDescriptor = averaged
    await user.save()

    return res.status(201).json({ message: 'Face enrolled successfully.' })
  } catch (err){
    return res.status(500).json({ message: 'Server error', error: err.message })
  }
})

router.get('/face/descriptors', requireAuth, requireRole('admin', 'teacher'), async (req, res) => {
  const users = await User.find({ role: { $ne: 'pending' }, faceDescriptor: { $exists: true } })
    .select('name userId role faceDescriptor')
  return res.json(users)
})

router.post('/barcode', async (req, res) => {
  try {
    const { barcode } = req.body
    if (!barcode) return res.status(400).json({ message: 'Barcode required' })
    const normalized = String(barcode).trim().toUpperCase()
    const user = await User.findOne({ $or: [{ barcode: normalized }, { userId: normalized }] })
    if (!user) return res.status(404).json({ message: 'User not found' })
    if (user.role === 'pending') return res.status(403).json({ message: 'User pending approval' })
    if (!user.userId) return res.status(400).json({ message: 'User does not have a valid userId' })

    const { now, date, time } = nowStrings()
    const existing = await Attendance.findOne({ user: user._id, date })
    if (!existing){
      await Attendance.create({
        user: user._id,
        name: user.name,
        userId: user.userId,
        role: user.role,
        method: 'barcode',
        status: 'present',
        timestamp: now,
        date,
        time
      })
    }

    return res.json({ status: 'marked', user: { id: user._id, name: user.name, userId: user.userId } })
  } catch (err){
    return res.status(500).json({ message: 'Server error', error: err.message })
  }
})

router.get('/logs', requireAuth, async (req, res) => {
  const user = await User.findById(req.user.id)
  if (!user) return res.status(404).json({ message: 'User not found' })

  let query = {}
  if (user.role === 'student'){
    query = { user: user._id }
  }
  if (user.role === 'teacher'){
    query = { user: { $in: user.assignedStudents } }
  }

  const logs = await Attendance.find(query).sort({ timestamp: -1 }).limit(1000)
  return res.json(logs)
})

export default router
