import express from 'express'
import { User } from '../models/User.js'
import { Attendance } from '../models/Attendance.js'
import { AttendanceSession } from '../models/AttendanceSession.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { averageDescriptors, euclideanDistance, findConsistentFaceMatch, isFaceDescriptor } from '../utils/face.js'
import { Op } from 'sequelize'
import { sequelize } from '../db.js'
import { BiometricAudit } from '../models/BiometricAudit.js'
import { decryptTemplate, encryptTemplate, hasTemplateForUser, templateStatusFields } from '../utils/biometrics.js'
import { nowIST } from '../utils/date.js'
import { assignedIds, attendanceTarget, buildAttendanceReports, reportWindow } from '../utils/attendanceReports.js'

const router = express.Router()
const staffOnly = [requireAuth, requireRole('admin', 'teacher')]

async function requireOpenSession(req, res, next) {
  const code = typeof req.body.sessionCode === 'string' ? req.body.sessionCode.trim().toUpperCase() : ''
  if (!/^[0-9A-F]{12}$/.test(code)) {
    return res.status(400).json({ message: 'Enter the 12-character attendance session code' })
  }
  try {
    const session = await AttendanceSession.findOne({ where: { code } })
    if (!session || session.expiresAt <= new Date()) {
      return res.status(410).json({ message: 'Session code is invalid or the session has ended' })
    }
    req.attendanceSession = session
    next()
  } catch (error) {
    console.error('Attendance session lookup failed:', error.name)
    res.status(503).json({ message: 'Could not check the attendance session. Try again.' })
  }
}

async function markForSession(res, sessionId, student, method) {
  const result = await sequelize.transaction(async transaction => {
    const session = await AttendanceSession.findByPk(sessionId, { transaction, lock: true })
    const { now, date, time } = nowIST()
    if (!session || session.expiresAt <= now) return null

    const where = { userId: student.id, sessionId }
    const existing = await Attendance.findOne({ where, transaction })
    if (!existing) {
      await Attendance.create({
        ...where,
        userIdText: student.userId,
        name: student.name,
        role: student.role,
        method,
        status: 'present',
        timestamp: now,
        date,
        time
      }, { transaction })
    }
    return { status: existing ? 'already_marked' : 'marked', subject: session.subject }
  })
  if (!result) return res.status(410).json({ message: 'The attendance session has ended' })
  return res.json({ ...result, user: { name: student.name } })
}

router.post('/face/verify', requireOpenSession, async (req, res) => {
  let audit
  try {
    const { descriptors, qualities } = req.body
    if (!Array.isArray(descriptors) || descriptors.length !== 3 || !descriptors.every(isFaceDescriptor)) {
      return res.status(400).json({ message: 'Three valid face samples are required' })
    }
    if (new Set(descriptors.map((descriptor) => JSON.stringify(descriptor))).size !== descriptors.length) {
      return res.status(400).json({ message: 'Capture a fresh frame for each face sample' })
    }
    if (!Array.isArray(qualities) || qualities.length !== 3 || !qualities.every((score) => Number.isFinite(score) && score >= 0.45 && score <= 1)) {
      return res.status(400).json({ message: 'Face image quality is too low. Improve lighting or use barcode attendance.' })
    }

    audit = await BiometricAudit.create({ action: 'verification', outcome: 'started' })
    const users = await User.unscoped().findAll({
      attributes: ['id', 'userId', 'name', 'role', 'faceDescriptor'],
      where: {
        role: 'student',
        faceDescriptor: { [Op.ne]: null }
      }
    })
    const templates = users
      .map((user) => ({ user, template: decryptTemplate(user.faceDescriptor, user.id) }))
      .filter(({ template }) => template)
    const match = findConsistentFaceMatch(descriptors, templates, qualities)
    if (!match) {
      await audit.update({ outcome: 'rejected', templateCount: templates.length })
      return res.status(404).json({ status: 'not_found', message: 'Face could not be matched confidently' })
    }

    const { user: best } = match
    await audit.update({ subjectId: best.id, outcome: 'matched', templateCount: templates.length })
    if (!best.userId) {
      return res.status(400).json({ message: 'User does not have a valid userId' })
    }

    return await markForSession(res, req.attendanceSession.id, best, 'face')
  } catch (err) {
    if (audit?.outcome === 'started') await audit.update({ outcome: 'error' }).catch(() => {})
    console.error('Face verification failed:', err.name)
    return res.status(500).json({ message: 'Face verification is unavailable. Try barcode attendance.' })
  }
})

function canManageEnrollment(actor, target) {
  return actor?.role === 'admin' || (actor?.role === 'teacher' &&
    target.role === 'student' && assignedIds(actor).includes(target.id))
}

router.post('/face/enroll/:targetUserId', ...staffOnly, async (req, res) => {
  try {
    const { descriptors } = req.body
    if (!Array.isArray(descriptors) || descriptors.length < 5 || descriptors.length > 12 || !descriptors.every(isFaceDescriptor)) {
      return res.status(400).json({ message: 'Provide 5 to 12 valid face samples' })
    }
    const template = averageDescriptors(descriptors)
    const outcome = await sequelize.transaction(async (transaction) => {
      // Serialize staff enrollment against the same roster so concurrent requests cannot both enroll a duplicate.
      const roster = await User.unscoped().findAll({
        attributes: ['id', 'role', 'assignedStudents'],
        order: [['id', 'ASC']], transaction, lock: true
      })
      const actor = roster.find((user) => user.id === req.user.id)
      const target = roster.find((user) => String(user.id) === req.params.targetUserId)
      if (!target) return { code: 404, message: 'Target user not found' }
      if (target.role === 'pending' || !canManageEnrollment(actor, target)) {
        return { code: 403, message: 'Enrollment is limited to approved accounts within your access' }
      }
      const candidates = await User.unscoped().findAll({
        attributes: ['id', 'faceDescriptor'],
        where: { id: { [Op.ne]: target.id }, role: { [Op.ne]: 'pending' }, faceDescriptor: { [Op.ne]: null } },
        transaction
      })
      const duplicate = candidates.some((user) => {
        const existing = decryptTemplate(user.faceDescriptor, user.id)
        return existing && euclideanDistance(template, existing) <= 0.45
      })
      await BiometricAudit.create({
        action: 'enrollment', actorId: actor.id, subjectId: target.id, templateCount: candidates.length,
        outcome: duplicate ? 'duplicate' : 'encrypted'
      }, { transaction })
      if (duplicate) return { code: 409, message: 'Face already enrolled for another account' }
      await target.update({ faceDescriptor: encryptTemplate(template, target.id) }, { transaction })
      return { code: 201, message: 'Face enrolled successfully' }
    })
    return res.status(outcome.code).json({ message: outcome.message })
  } catch (err) {
    console.error('Face enrollment failed:', err.name)
    return res.status(500).json({ message: 'Face enrollment is unavailable' })
  }
})

router.delete('/face/enroll/:userId', ...staffOnly, async (req, res) => {
  try {
    const outcome = await sequelize.transaction(async (transaction) => {
      const actor = await User.findByPk(req.user.id, { transaction })
      const target = await User.findByPk(req.params.userId, { transaction, lock: true })
      if (!target) return 404
      if (!canManageEnrollment(actor, target)) return 403
      await target.update({ faceDescriptor: null }, { transaction })
      await BiometricAudit.create({ action: 'reset', actorId: actor.id, subjectId: target.id, outcome: 'deleted' }, { transaction })
      return 200
    })
    return res.status(outcome).json({ message: outcome === 200 ? 'Face enrollment reset' : 'Face reset is unavailable for this account' })
  } catch (err) {
    console.error('Face reset failed:', err.name)
    return res.status(500).json({ message: 'Face reset is unavailable' })
  }
})

router.get('/my-students', ...staffOnly, async (req, res) => {
  try {
    const viewer = await User.findByPk(req.user.id, { attributes: ['role', 'assignedStudents'] })
    if (!['admin', 'teacher'].includes(viewer?.role)) return res.status(403).json({ message: 'Student access denied' })
    const where = viewer.role === 'admin' ? { role: 'student' } : { role: 'student', id: { [Op.in]: assignedIds(viewer) } }
    const students = await User.unscoped().findAll({
      where, attributes: ['id', 'name', 'email', 'userId', ...templateStatusFields]
    })
    res.set('Cache-Control', 'private, no-store')
    return res.json(students.map((student) => ({
      id: student.id, name: student.name, email: student.email, userId: student.userId, hasFace: hasTemplateForUser(student)
    })))
  } catch (err) {
    console.error('Student enrollment status failed:', err.name)
    return res.status(500).json({ message: 'Student enrollment status is unavailable' })
  }
})

router.post('/barcode', requireOpenSession, async (req, res) => {
  try {
    const { barcode } = req.body
    if (!barcode) return res.status(400).json({ message: 'Barcode required' })
    const normalized = String(barcode).trim().toUpperCase()
    const user = await User.findOne({
      where: { role: 'student', [Op.or]: [{ barcode: normalized }, { userId: normalized }] }
    })
    if (!user) return res.status(404).json({ message: 'User not found' })
    if (!user.userId) return res.status(400).json({ message: 'User does not have a valid userId' })

    return await markForSession(res, req.attendanceSession.id, user, 'barcode')
  } catch (err) {
    console.error('[Barcode] Error:', err.message)
    return res.status(500).json({ message: 'Barcode attendance is unavailable' })
  }
})

router.get('/reports', requireAuth, async (req, res) => {
  try {
    const viewer = await User.findByPk(req.user.id, { attributes: ['id', 'role', 'assignedStudents'] })
    if (!viewer || !['student', 'teacher', 'admin'].includes(viewer.role)) return res.status(403).json({ message: 'Attendance report access denied' })
    const target = attendanceTarget()
    const now = new Date()
    const window = reportWindow(now)
    const detailed = viewer.role === 'student'
    const where = { role: 'student' }
    if (detailed) where.id = viewer.id
    if (viewer.role === 'teacher') where.id = { [Op.in]: assignedIds(viewer) }

    const students = await User.findAll({
      where, attributes: ['id', 'name', 'userId', 'createdAt'],
      order: [['name', 'ASC'], ['id', 'ASC']], raw: true
    })
    res.set('Cache-Control', 'private, no-store')
    if (!students.length) return res.json({ target, window, students: [] })

    const [sessions, records] = await Promise.all([
      AttendanceSession.findAll({
        where: { createdAt: { [Op.between]: [new Date(window.start + 'T00:00:00+05:30'), now] } },
        attributes: ['id', 'subject', 'createdBy', 'createdAt', 'expiresAt'],
        order: [['createdAt', 'ASC'], ['id', 'ASC']], raw: true
      }),
      Attendance.findAll({
        where: {
          userId: { [Op.in]: students.map(student => student.id) },
          sessionId: { [Op.ne]: null }, date: { [Op.gte]: window.start }
        },
        attributes: ['userId', 'sessionId'], raw: true
      })
    ])
    const creators = await User.findAll({
      where: { id: { [Op.in]: [...new Set(sessions.map(session => session.createdBy))] } },
      attributes: ['id', 'role', 'assignedStudents']
    })
    for (const session of sessions) session.date = nowIST(session.createdAt).date
    return res.json({
      target, window,
      students: buildAttendanceReports(students, sessions, creators, records, { target, now, detailed })
    })
  } catch (err) {
    console.error('Attendance reports failed:', err.name)
    return res.status(500).json({ message: 'Attendance reports are unavailable' })
  }
})

router.get('/logs', requireAuth, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id)
    if (!user) return res.status(404).json({ message: 'User not found' })

    let whereClause = {}
    if (user.role === 'student') {
      whereClause = { userId: user.id }
    }
    if (user.role === 'teacher') {
      const assigned = assignedIds(user)
      whereClause = { userId: { [Op.in]: assigned } }
    }

    const logs = await Attendance.findAll({
      where: whereClause,
      order: [['timestamp', 'DESC']],
      include: [{ association: 'session', attributes: ['subject'] }],
      limit: 1000
    })
    return res.json(logs)
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message })
  }
})

export default router
