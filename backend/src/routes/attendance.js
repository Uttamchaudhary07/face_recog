import express from 'express'
import { User } from '../models/User.js'
import { Attendance } from '../models/Attendance.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { euclideanDistance, averageDescriptors, validateDescriptor } from '../utils/face.js'
import { nowIST } from '../utils/date.js'
import { Op } from 'sequelize'

const router = express.Router()

const VERIFY_THRESHOLD = 0.42
const CONFIDENCE_GAP = 0.08
const ENROLL_DUPLICATE_THRESHOLD = 0.45

// ─── Verification (public) ────────────────────────────────────────────────────
router.post('/face/verify', async (req, res) => {
  try {
    const { descriptor } = req.body
    if (!validateDescriptor(descriptor)) {
      return res.status(400).json({ message: 'Valid 128-element descriptor required' })
    }

    const users = await User.findAll({ where: { role: { [Op.ne]: 'pending' } } })
    const enrolled = users.filter(u => validateDescriptor(u.faceDescriptor))
    console.log(`[FaceVerify] Comparing against ${enrolled.length} enrolled users`)

    // Find best AND second-best match
    let best = null, second = null
    let bestDist = Infinity, secondDist = Infinity

    for (const user of enrolled) {
      const d = euclideanDistance(descriptor, user.faceDescriptor)
      if (d < bestDist) {
        second = best; secondDist = bestDist
        best = user; bestDist = d
      } else if (d < secondDist) {
        second = user; secondDist = d
      }
    }

    if (!best || bestDist > VERIFY_THRESHOLD) {
      console.log(`[FaceVerify] No match. Best distance: ${bestDist?.toFixed(3) ?? 'N/A'}`)
      return res.status(404).json({ status: 'not_found', message: 'Face not recognized' })
    }

    // Confidence gap check: prevent ambiguous matches between similar-looking people
    if (second && (secondDist - bestDist) < CONFIDENCE_GAP) {
      console.log(`[FaceVerify] Ambiguous match. Best: ${bestDist.toFixed(3)} (${best.name}), Second: ${secondDist.toFixed(3)} (${second.name}), Gap: ${(secondDist - bestDist).toFixed(3)}`)
      return res.status(404).json({ status: 'ambiguous', message: 'Recognition confidence too low. Adjust position and try again.' })
    }

    if (!best.userId) {
      return res.status(400).json({ message: 'User has no valid userId assigned' })
    }

    console.log(`[FaceVerify] Matched: ${best.name} | Distance: ${bestDist.toFixed(3)} | Gap: ${second ? (secondDist - bestDist).toFixed(3) : 'N/A (sole user)'}`)

    const { now, date, time } = nowIST()
    const existing = await Attendance.findOne({ where: { userId: best.id, date } })
    if (existing) {
      return res.json({ status: 'already_marked', user: { id: best.id, name: best.name, userId: best.userId }, distance: bestDist })
    }

    await Attendance.create({
      userId: best.id,
      userIdText: best.userId,
      name: best.name,
      role: best.role,
      method: 'face',
      status: 'present',
      timestamp: now,
      date,
      time
    })

    return res.json({ status: 'marked', user: { id: best.id, name: best.name, userId: best.userId }, distance: bestDist })
  } catch (err) {
    console.error('[FaceVerify] Error:', err.message)
    return res.status(500).json({ message: 'Server error', error: err.message })
  }
})

// ─── Enrollment by Admin/Teacher for a specific target user ──────────────────
router.post('/face/enroll/:targetUserId', requireAuth, requireRole('admin', 'teacher'), async (req, res) => {
  try {
    const { descriptors } = req.body
    if (!Array.isArray(descriptors) || descriptors.length < 5) {
      return res.status(400).json({ message: 'Provide at least 5 face descriptors' })
    }

    const validDescriptors = descriptors.filter(validateDescriptor)
    if (validDescriptors.length < 5) {
      return res.status(400).json({ message: 'Too many invalid descriptors. Recapture the face.' })
    }

    const target = await User.findByPk(req.params.targetUserId)
    if (!target) return res.status(404).json({ message: 'Target user not found' })
    if (target.role === 'pending') return res.status(403).json({ message: 'Cannot enroll a pending user. Assign a role first.' })

    // Teachers may only enroll their assigned students
    if (req.user.role === 'teacher') {
      const teacher = await User.findByPk(req.user.id)
      const assigned = (teacher?.assignedStudents || []).map(String)
      if (!assigned.includes(String(target.id))) {
        return res.status(403).json({ message: 'You may only enroll faces for your assigned students' })
      }
    }

    const averaged = averageDescriptors(validDescriptors)
    if (!averaged) return res.status(400).json({ message: 'Could not compute a valid descriptor. Recapture the face.' })

    // Duplicate check against all OTHER enrolled users
    const others = await User.findAll({
      where: { id: { [Op.ne]: target.id }, role: { [Op.ne]: 'pending' } }
    })
    for (const other of others) {
      if (!validateDescriptor(other.faceDescriptor)) continue
      const dist = euclideanDistance(averaged, other.faceDescriptor)
      if (dist <= ENROLL_DUPLICATE_THRESHOLD) {
        console.log(`[Enrollment] Duplicate detected. New face matches ${other.name} at distance ${dist.toFixed(3)}`)
        return res.status(409).json({
          status: 'already_enrolled',
          message: `Face already enrolled. This face matches an existing account.`
        })
      }
    }

    await target.update({ faceDescriptor: averaged })
    console.log(`[Enrollment] Face enrolled successfully for ${target.name} (ID: ${target.id}) by ${req.user.role} ${req.user.name}`)
    return res.status(201).json({ message: `Face enrolled successfully for ${target.name}.` })
  } catch (err) {
    console.error('[Enrollment] Error:', err.message)
    return res.status(500).json({ message: 'Server error', error: err.message })
  }
})

// ─── Reset face enrollment (Admin/Teacher) ───────────────────────────────────
router.delete('/face/enroll/:userId', requireAuth, requireRole('admin', 'teacher'), async (req, res) => {
  try {
    const target = await User.findByPk(req.params.userId)
    if (!target) return res.status(404).json({ message: 'User not found' })

    if (req.user.role === 'teacher') {
      const teacher = await User.findByPk(req.user.id)
      const assigned = (teacher?.assignedStudents || []).map(String)
      if (!assigned.includes(String(target.id))) {
        return res.status(403).json({ message: 'You may only reset face enrollment for your assigned students' })
      }
    }

    await target.update({ faceDescriptor: null })
    console.log(`[EnrollReset] Face enrollment cleared for ${target.name} by ${req.user.role} ${req.user.name}`)
    return res.json({ message: `Face enrollment reset for ${target.name}` })
  } catch (err) {
    console.error('[EnrollReset] Error:', err.message)
    return res.status(500).json({ message: 'Server error', error: err.message })
  }
})

// ─── List enrolled descriptors (Admin/Teacher — for debugging) ───────────────
router.get('/face/descriptors', requireAuth, requireRole('admin', 'teacher'), async (req, res) => {
  try {
    const users = await User.findAll({
      where: { role: { [Op.ne]: 'pending' } },
      attributes: ['id', 'name', 'userId', 'role', 'faceDescriptor']
    })
    return res.json(users.filter(u => validateDescriptor(u.faceDescriptor)))
  } catch (err) {
    console.error('[FaceDescriptors] Error:', err.message)
    return res.status(500).json({ message: 'Server error', error: err.message })
  }
})

// ─── Students visible to caller (Admin = all, Teacher = assigned) ─────────────
router.get('/my-students', requireAuth, requireRole('admin', 'teacher'), async (req, res) => {
  try {
    let students
    if (req.user.role === 'admin') {
      students = await User.findAll({
        where: { role: 'student' },
        attributes: ['id', 'name', 'email', 'userId', 'faceDescriptor']
      })
    } else {
      const teacher = await User.findByPk(req.user.id)
      const assigned = teacher?.assignedStudents || []
      if (assigned.length === 0) return res.json([])
      students = await User.findAll({
        where: { id: { [Op.in]: assigned }, role: 'student' },
        attributes: ['id', 'name', 'email', 'userId', 'faceDescriptor']
      })
    }
    return res.json(students.map(s => ({
      id: s.id,
      name: s.name,
      email: s.email,
      userId: s.userId,
      hasFace: validateDescriptor(s.faceDescriptor)
    })))
  } catch (err) {
    console.error('[MyStudents] Error:', err.message)
    return res.status(500).json({ message: 'Server error', error: err.message })
  }
})

// ─── Barcode / manual ID attendance (public) ─────────────────────────────────
router.post('/barcode', async (req, res) => {
  try {
    const { barcode } = req.body
    if (!barcode) return res.status(400).json({ message: 'Barcode required' })
    const normalized = String(barcode).trim().toUpperCase()
    const user = await User.findOne({
      where: { [Op.or]: [{ barcode: normalized }, { userId: normalized }] }
    })
    if (!user) return res.status(404).json({ message: 'User not found' })
    if (user.role === 'pending') return res.status(403).json({ message: 'User pending approval' })
    if (!user.userId) return res.status(400).json({ message: 'User does not have a valid userId' })

    const { now, date, time } = nowIST()
    const existing = await Attendance.findOne({ where: { userId: user.id, date } })
    if (existing) {
      return res.json({ status: 'already_marked', user: { id: user.id, name: user.name, userId: user.userId } })
    }

    await Attendance.create({
      userId: user.id,
      userIdText: user.userId,
      name: user.name,
      role: user.role,
      method: 'barcode',
      status: 'present',
      timestamp: now,
      date,
      time
    })
    return res.json({ status: 'marked', user: { id: user.id, name: user.name, userId: user.userId } })
  } catch (err) {
    console.error('[Barcode] Error:', err.message)
    return res.status(500).json({ message: 'Server error', error: err.message })
  }
})

// ─── Attendance logs ──────────────────────────────────────────────────────────
router.get('/logs', requireAuth, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id)
    if (!user) return res.status(404).json({ message: 'User not found' })

    let whereClause = {}
    if (user.role === 'student') whereClause = { userId: user.id }
    if (user.role === 'teacher') whereClause = { userId: { [Op.in]: user.assignedStudents || [] } }

    const logs = await Attendance.findAll({
      where: whereClause,
      order: [['timestamp', 'DESC']],
      limit: 1000
    })
    return res.json(logs)
  } catch (err) {
    console.error('[Logs] Error:', err.message)
    return res.status(500).json({ message: 'Server error', error: err.message })
  }
})

export default router
