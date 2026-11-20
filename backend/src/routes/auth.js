import express from 'express'
import bcrypt from 'bcryptjs'
import { User } from '../models/User.js'
import { signToken, requireAuth } from '../middleware/auth.js'
import { hasTemplateForUser, templateStatusFields } from '../utils/biometrics.js'

const router = express.Router()
const profileFields = [
  'id', 'name', 'email', 'role', 'userId', 'subjects', 'assignedStudents',
  ...templateStatusFields
]

function profile(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    userId: user.userId,
    subjects: user.subjects || [],
    assignedStudents: user.assignedStudents || [],
    hasFace: hasTemplateForUser(user)
  }
}

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' })

    const user = await User.unscoped().findOne({ where: { email: email.toLowerCase() }, attributes: [...profileFields, 'passwordHash'] })
    if (!user || !user.passwordHash) return res.status(401).json({ message: 'Invalid credentials' })

    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' })

    if (user.role === 'pending') {
      return res.status(403).json({ message: 'Account pending admin approval' })
    }

    const token = signToken(user)
    return res.json({
      token,
      user: profile(user)
    })
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message })
  }
})

router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await User.unscoped().findByPk(req.user.id, { attributes: profileFields })
    if (!user) return res.status(404).json({ message: 'User not found' })
    res.set('Cache-Control', 'private, no-store')
    return res.json(profile(user))
  } catch (err) {
    console.error('Account profile failed:', err.name)
    return res.status(500).json({ message: 'Account profile is unavailable' })
  }
})

export default router
