import express from 'express'
import { User } from '../models/User.js'
import { Attendance } from '../models/Attendance.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { averageDescriptors, euclideanDistance, findConsistentFaceMatch, isFaceDescriptor } from '../utils/face.js'
import { Op } from 'sequelize'
import { sequelize } from '../db.js'
import { BiometricAudit } from '../models/BiometricAudit.js'
import { decryptTemplate, encryptTemplate, hasTemplateForUser, templateStatusFields } from '../utils/biometrics.js'
import { nowIST } from '../utils/date.js'
import { attendanceTarget, buildAttendanceReports, cohortKey, reportWindow } from '../utils/attendanceReports.js'

const router = express.Router()
const staffOnly = [requireAuth, requireRole('admin', 'teacher')]
const hosted = Boolean(process.env.VERCEL) || process.env.NODE_ENV === 'production'
const kioskAccess = hosted ? [...staffOnly, async (req, res, next) => {
  try {
    const actor = await User.findByPk(req.user.id, { attributes: ['role'] })
    if (!['admin', 'teacher'].includes(actor?.role)) return res.status(403).json({ message: 'Staff sign-in required to mark attendance' })
    next()
  } catch {
    res.status(503).json({ message: 'Kiosk access is unavailable' })
  }
}] : []


router.post('/face/verify', ...kioskAccess, async (req, res) => {
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

    audit = await BiometricAudit.create({ action: 'verification', actorId: req.user?.id, outcome: 'started' })
    const users = await User.unscoped().findAll({
      attributes: ['id', 'userId', 'name', 'role', 'faceDescriptor'],
      where: {
        role: { [Op.ne]: 'pending' },
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

    const { now, date, time } = nowIST()
    const existing = await Attendance.findOne({ where: { userId: best.id, date } })
    if (!existing) {
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
    }

    return res.json({ status: existing ? 'already_marked' : 'marked', user: { id: best.id, name: best.name, userId: best.userId } })
  } catch (err) {
    if (audit?.outcome === 'started') await audit.update({ outcome: 'error' }).catch(() => {})
    console.error('Face verification failed:', err.name)
    return res.status(500).json({ message: 'Face verification is unavailable. Try barcode attendance.' })
  }
})

function assignedIds(user) {
  return (user?.assignedStudents || []).map((value) => Number(value?.id ?? value)).filter(Number.isSafeInteger)
}

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

router.post('/barcode', ...kioskAccess, async (req, res) => {
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

router.get('/reports', requireAuth, async (req, res) => {
  try {
    const viewer = await User.findByPk(req.user.id, { attributes: ['id', 'role', 'assignedStudents'] })
    if (!viewer || !['student', 'teacher', 'admin'].includes(viewer.role)) return res.status(403).json({ message: 'Attendance report access denied' })
    const target = attendanceTarget()
    const window = reportWindow()
    const roster = await User.findAll({
      where: { role: 'student' },
      attributes: ['id', 'name', 'userId', 'department', 'semester', 'section', 'createdAt'],
      order: [['name', 'ASC'], ['id', 'ASC']]
    })
    const assigned = new Set(assignedIds(viewer))
    const students = roster.filter((student) => viewer.role === 'admin' ||
      (viewer.role === 'teacher' ? assigned.has(student.id) : viewer.id === student.id))
    const cohorts = new Set(students.map(cohortKey).filter(Boolean))
    const studentIds = new Set(students.map((student) => student.id))
    const cohortMembers = roster.filter((student) => studentIds.has(student.id) || cohorts.has(cohortKey(student)))
    const records = cohortMembers.length ? await Attendance.findAll({
      attributes: ['userId', 'date'],
      where: { userId: { [Op.in]: cohortMembers.map((student) => student.id) }, date: { [Op.gte]: window.start, [Op.lt]: window.before } },
      raw: true
    }) : []
    res.set('Cache-Control', 'private, no-store')
    return res.json({ target, window, students: buildAttendanceReports(students, cohortMembers, records, target) })
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
      limit: 1000
    })
    return res.json(logs)
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message })
  }
})

export default router
