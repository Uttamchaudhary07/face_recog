import { randomBytes } from 'node:crypto'
import express from 'express'
import { Op, UniqueConstraintError } from 'sequelize'
import { AttendanceSession } from '../models/AttendanceSession.js'
import { User } from '../models/User.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const router = express.Router()
router.use(requireAuth, requireRole('admin', 'teacher'), async (req, res, next) => {
  try {
    const staff = await User.findByPk(req.user.id, { attributes: ['id', 'role', 'subjects'] })
    if (!staff || !['admin', 'teacher'].includes(staff.role)) {
      return res.status(403).json({ message: 'Staff sign-in is required to manage sessions' })
    }
    req.staff = staff
    res.set('Cache-Control', 'private, no-store')
    next()
  } catch (error) {
    next(error)
  }
})

function sessionScope(staff) {
  return staff.role === 'teacher' ? { createdBy: staff.id } : {}
}

function staffSubjects(staff) {
  return (Array.isArray(staff.subjects) ? staff.subjects : [])
    .filter(subject => typeof subject === 'string' && subject.trim())
    .map(subject => subject.trim())
}

router.get('/', async (req, res, next) => {
  try {
    const sessions = await AttendanceSession.findAll({
      where: sessionScope(req.staff),
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
      limit: 30
    })
    res.json({ subjects: staffSubjects(req.staff), sessions })
  } catch (error) {
    next(error)
  }
})

router.post('/', async (req, res, next) => {
  const subject = typeof req.body.subject === 'string' ? req.body.subject.trim() : ''
  const { durationMinutes } = req.body
  if (!subject || subject.length > 100 || !Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 120) {
    return res.status(400).json({ message: 'Enter a subject and a duration from 1 to 120 minutes' })
  }
  const assigned = staffSubjects(req.staff).find(name => name.toLowerCase() === subject.toLowerCase())
  if (req.staff.role === 'teacher' && !assigned) {
    return res.status(403).json({ message: 'You can only start sessions for your assigned subjects' })
  }

  try {
    const expiresAt = new Date(Date.now() + durationMinutes * 60_000)
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const session = await AttendanceSession.create({
          code: randomBytes(6).toString('hex').toUpperCase(),
          subject: req.staff.role === 'teacher' ? assigned : subject,
          createdBy: req.staff.id,
          expiresAt
        })
        return res.status(201).json(session)
      } catch (error) {
        if (!(error instanceof UniqueConstraintError)) throw error
      }
    }
    return res.status(503).json({ message: 'Could not generate a session code. Try again.' })
  } catch (error) {
    next(error)
  }
})

router.patch('/:id/close', async (req, res, next) => {
  const id = Number(req.params.id)
  if (!Number.isSafeInteger(id) || id < 1) return res.sendStatus(404)
  try {
    const now = new Date()
    const [updated] = await AttendanceSession.update({ expiresAt: now }, {
      where: { id, ...sessionScope(req.staff), expiresAt: { [Op.gt]: now } }
    })
    if (updated) return res.json({ expiresAt: now })
    return res.status(404).json({ message: 'Open session not found' })
  } catch (error) {
    next(error)
  }
})

router.use((error, req, res, next) => {
  if (res.headersSent) return next(error)
  console.error('Attendance session request failed:', error.name)
  return res.status(500).json({ message: 'Attendance sessions are unavailable' })
})

export default router
