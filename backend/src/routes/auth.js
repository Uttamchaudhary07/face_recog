import express from 'express'
import bcrypt from 'bcryptjs'
import { User } from '../models/User.js'
import { signToken, requireAuth } from '../middleware/auth.js'

const router = express.Router()

router.post('/signup', async (req, res) => {
  try {
    const { name, email, password, userId } = req.body
    if (!name || !email || !password){
      return res.status(400).json({ message: 'Name, email, and password are required' })
    }
    const exists = await User.findOne({ email: email.toLowerCase() })
    if (exists) return res.status(409).json({ message: 'Email already registered' })

    const passwordHash = await bcrypt.hash(password, 10)
    const user = await User.create({
      name,
      email: email.toLowerCase(),
      passwordHash,
      userId: userId ? userId.toUpperCase() : undefined,
      role: 'pending'
    })

    return res.status(201).json({
      message: 'Account created. Awaiting admin approval.',
      user: { id: user._id, name: user.name, role: user.role }
    })
  } catch (err){
    return res.status(500).json({ message: 'Server error', error: err.message })
  }
})

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' })

    const user = await User.findOne({ email: email.toLowerCase() })
    if (!user || !user.passwordHash) return res.status(401).json({ message: 'Invalid credentials' })

    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' })

    if (user.role === 'pending'){
      return res.status(403).json({ message: 'Account pending admin approval' })
    }

    const token = signToken(user)
    return res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        userId: user.userId,
        subjects: user.subjects,
        assignedStudents: user.assignedStudents,
        hasFace: Array.isArray(user.faceDescriptor) && user.faceDescriptor.length > 0
      }
    })
  } catch (err){
    return res.status(500).json({ message: 'Server error', error: err.message })
  }
})

router.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.user.id).populate('assignedStudents', 'name userId')
  if (!user) return res.status(404).json({ message: 'User not found' })
  return res.json({
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    userId: user.userId,
    subjects: user.subjects,
    assignedStudents: user.assignedStudents,
    hasFace: Array.isArray(user.faceDescriptor) && user.faceDescriptor.length > 0
  })
})

export default router
