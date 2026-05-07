import express from 'express'
import bcrypt from 'bcryptjs'
import { User } from '../models/User.js'
import { Attendance } from '../models/Attendance.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const router = express.Router()
router.use(requireAuth, requireRole('admin'))

const ALLOWED_ROLES = ['admin', 'teacher', 'student', 'pending']

// ─── Parse CSV text ───────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const rows = []
  for (const line of lines) {
    if (!line.trim()) continue
    const fields = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        inQuotes = !inQuotes
      } else if (ch === ',' && !inQuotes) {
        fields.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
    fields.push(current.trim())
    rows.push(fields)
  }
  return rows
}

// ─── List users ───────────────────────────────────────────────────────────────
router.get('/users', async (req, res) => {
  try {
    const role = req.query.role
    const users = await User.findAll({ where: role ? { role } : {} })
    return res.json(users.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      userId: u.userId,
      barcode: u.barcode,
      subjects: u.subjects,
      assignedStudents: u.assignedStudents,
      hasFace: Array.isArray(u.faceDescriptor) && u.faceDescriptor.length === 128,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt
    })))
  } catch (err) {
    console.error('[AdminUsers] Error:', err.message)
    return res.status(500).json({ message: 'Server error', error: err.message })
  }
})

// ─── Create user ──────────────────────────────────────────────────────────────
router.post('/users', async (req, res) => {
  try {
    const { name, email, password, role, userId, barcode } = req.body
    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: 'name, email, password, and role are required' })
    }
    if (!ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({ message: `Invalid role. Allowed: ${ALLOWED_ROLES.join(', ')}` })
    }
    if (role === 'student' && !userId) {
      return res.status(400).json({ message: 'Student userId (USN) is required' })
    }
    const passwordHash = await bcrypt.hash(password, 10)
    const user = await User.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      passwordHash,
      role,
      userId: userId ? userId.trim().toUpperCase() : undefined,
      barcode: barcode ? barcode.trim().toUpperCase() : undefined
    })
    console.log(`[AdminCreateUser] Created ${role} "${name}" (${email})`)
    return res.status(201).json({ id: user.id, name: user.name, email: user.email, role: user.role, userId: user.userId })
  } catch (err) {
    console.error('[AdminCreateUser] Error:', err.message)
    return res.status(500).json({ message: 'Server error', error: err.message })
  }
})

// ─── Update user ──────────────────────────────────────────────────────────────
router.patch('/users/:id', async (req, res) => {
  try {
    const { role, assignedStudents, subjects, barcode, userId, name, email, password } = req.body
    const existing = await User.findByPk(req.params.id)
    if (!existing) return res.status(404).json({ message: 'User not found' })

    if (userId && existing.userId && userId.toUpperCase() !== existing.userId.toUpperCase()) {
      return res.status(400).json({ message: 'userId is immutable once set' })
    }

    const update = {}
    if (role) {
      if (!ALLOWED_ROLES.includes(role)) return res.status(400).json({ message: 'Invalid role' })
      update.role = role
    }
    if (role === 'student' && !existing.userId && !userId) {
      return res.status(400).json({ message: 'Student userId (USN) is required' })
    }
    if (Array.isArray(assignedStudents)) update.assignedStudents = assignedStudents
    if (Array.isArray(subjects)) update.subjects = subjects
    if (barcode !== undefined) update.barcode = barcode ? barcode.trim().toUpperCase() : null
    if (userId !== undefined && !existing.userId) update.userId = userId ? userId.trim().toUpperCase() : null
    if (name) update.name = name.trim()
    if (email) update.email = email.trim().toLowerCase()
    if (password) update.passwordHash = await bcrypt.hash(password, 10)

    await existing.update(update)
    const updated = await User.findByPk(req.params.id)
    return res.json({
      id: updated.id, name: updated.name, email: updated.email, role: updated.role,
      userId: updated.userId, barcode: updated.barcode,
      hasFace: Array.isArray(updated.faceDescriptor) && updated.faceDescriptor.length === 128
    })
  } catch (err) {
    console.error('[AdminUpdateUser] Error:', err.message)
    return res.status(500).json({ message: 'Server error', error: err.message })
  }
})

// ─── Delete user ──────────────────────────────────────────────────────────────
router.delete('/users/:id', async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id)
    if (!user) return res.status(404).json({ message: 'User not found' })

    // Protect the primary admin account from deletion
    if (user.email === (process.env.ADMIN_EMAIL || '').toLowerCase()) {
      return res.status(403).json({ message: 'Cannot delete the default admin account' })
    }
    if (user.id === req.user.id) {
      return res.status(403).json({ message: 'Cannot delete your own account' })
    }

    await Attendance.destroy({ where: { userId: user.id } })
    await user.destroy()
    console.log(`[AdminDeleteUser] Deleted user "${user.name}" (${user.email})`)
    return res.json({ message: `User "${user.name}" deleted successfully` })
  } catch (err) {
    console.error('[AdminDeleteUser] Error:', err.message)
    return res.status(500).json({ message: 'Server error', error: err.message })
  }
})

// ─── Attendance logs ──────────────────────────────────────────────────────────
router.get('/attendance', async (req, res) => {
  try {
    const logs = await Attendance.findAll({
      order: [['timestamp', 'DESC']],
      limit: 1000,
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'userId', 'email'] }]
    })
    return res.json(logs)
  } catch (err) {
    console.error('[AdminAttendance] Error:', err.message)
    return res.status(500).json({ message: 'Server error', error: err.message })
  }
})

// ─── CSV Bulk Import ──────────────────────────────────────────────────────────
// Expected CSV headers: name, email, password, userid, role
// Supported roles: student, teacher, admin, pending
// Students require a userid (USN). Existing emails are updated.
router.post('/csv-import', async (req, res) => {
  try {
    const { csv } = req.body
    if (!csv || typeof csv !== 'string') {
      return res.status(400).json({ message: 'CSV text is required in body as { csv: "..." }' })
    }

    const rows = parseCSV(csv)
    if (rows.length < 2) {
      return res.status(400).json({ message: 'CSV must have a header row and at least one data row' })
    }

    const [headerRow, ...dataRows] = rows
    const headers = headerRow.map(h => h.toLowerCase().trim().replace(/\s+/g, ''))
    console.log(`[CSV Import] Headers detected: ${headers.join(', ')}`)

    const required = ['name', 'email', 'password']
    for (const f of required) {
      if (!headers.includes(f)) {
        return res.status(400).json({ message: `CSV is missing required column: "${f}"` })
      }
    }

    const col = (row, field) => {
      const idx = headers.indexOf(field)
      return idx >= 0 ? (row[idx] || '').trim() : ''
    }

    const MAX_ROWS = 500
    const toProcess = dataRows.slice(0, MAX_ROWS)

    let created = 0, updated = 0, failed = 0
    const errors = []

    for (let i = 0; i < toProcess.length; i++) {
      const row = toProcess[i]
      const rowNum = i + 2

      const name = col(row, 'name')
      const email = col(row, 'email').toLowerCase()
      const password = col(row, 'password')
      const userId = (col(row, 'userid') || col(row, 'user_id')).toUpperCase()
      const role = (col(row, 'role') || 'student').toLowerCase()

      if (!name || !email || !password) {
        errors.push(`Row ${rowNum}: name, email, and password are required`)
        failed++
        continue
      }
      if (!email.includes('@') || !email.includes('.')) {
        errors.push(`Row ${rowNum}: invalid email "${email}"`)
        failed++
        continue
      }
      if (!ALLOWED_ROLES.includes(role)) {
        errors.push(`Row ${rowNum}: invalid role "${role}". Allowed: ${ALLOWED_ROLES.join(', ')}`)
        failed++
        continue
      }
      if (role === 'student' && !userId) {
        errors.push(`Row ${rowNum}: student role requires userid (USN)`)
        failed++
        continue
      }

      try {
        const passwordHash = await bcrypt.hash(password, 10)
        const existing = await User.findOne({ where: { email } })

        if (existing) {
          const upd = { name, passwordHash, role }
          if (userId && !existing.userId) upd.userId = userId
          await existing.update(upd)
          updated++
        } else {
          await User.create({
            name,
            email,
            passwordHash,
            role,
            userId: userId || null
          })
          created++
        }
      } catch (err) {
        const msg = err.parent?.sqlMessage || err.message
        errors.push(`Row ${rowNum}: ${msg}`)
        failed++
      }
    }

    console.log(`[CSV Import] Complete: ${created} created, ${updated} updated, ${failed} failed`)
    return res.json({
      message: `Import complete: ${created} created, ${updated} updated, ${failed} failed`,
      created,
      updated,
      failed,
      errors: errors.slice(0, 30)
    })
  } catch (err) {
    console.error('[CSV Import] Error:', err.message)
    return res.status(500).json({ message: 'Server error', error: err.message })
  }
})

// ─── Assign Students to Teacher via CSV ──────────────────────────────────────
// CSV format: name,userid  (header row optional; userid column is required)
// Appends to existing assignments without removing previously assigned students.
router.post('/assign-students-csv', async (req, res) => {
  try {
    const { teacherId, csv } = req.body
    if (!teacherId || !csv || typeof csv !== 'string') {
      return res.status(400).json({ message: 'teacherId and csv text are required' })
    }

    const teacher = await User.findOne({ where: { id: teacherId, role: 'teacher' } })
    if (!teacher) return res.status(404).json({ message: 'Teacher not found' })

    const rows = parseCSV(csv)
    if (rows.length === 0) return res.status(400).json({ message: 'CSV is empty' })

    // Detect header row
    const firstRowLower = rows[0].map(v => v.toLowerCase().trim())
    const hasHeader = firstRowLower.some(v => ['userid', 'user_id', 'name', 'email'].includes(v))
    const headers = hasHeader ? firstRowLower : ['userid']
    const dataRows = hasHeader ? rows.slice(1) : rows

    const col = (row, ...fields) => {
      for (const field of fields) {
        const idx = headers.indexOf(field)
        if (idx >= 0 && row[idx]) return row[idx].trim()
      }
      return row[0]?.trim() || ''
    }

    // Build set of already-assigned IDs to detect duplicates
    const existingSet = new Set((teacher.assignedStudents || []).map(String))
    const finalIds = [...(teacher.assignedStudents || [])]
    let assigned = 0, duplicates = 0, failed = 0
    const errors = []

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i]
      const rawId = col(row, 'userid', 'user_id')
      const userId = rawId.toUpperCase()
      if (!userId) {
        errors.push(`Row ${i + (hasHeader ? 2 : 1)}: missing userId`)
        failed++
        continue
      }

      const student = await User.findOne({ where: { userId, role: 'student' } })
      if (!student) {
        errors.push(`Row ${i + (hasHeader ? 2 : 1)}: student "${userId}" not found in system`)
        failed++
        continue
      }

      if (existingSet.has(String(student.id))) {
        duplicates++
        continue
      }

      finalIds.push(student.id)
      existingSet.add(String(student.id))
      assigned++
    }

    await teacher.update({ assignedStudents: finalIds })
    console.log(`[AssignCSV] Teacher ${teacher.name}: +${assigned} assigned, ${duplicates} duplicates, ${failed} failed`)

    return res.json({
      message: `Assignment complete: ${assigned} assigned, ${duplicates} already assigned, ${failed} failed`,
      assigned, duplicates, failed,
      errors: errors.slice(0, 20)
    })
  } catch (err) {
    console.error('[AssignCSV] Error:', err.message)
    return res.status(500).json({ message: 'Server error', error: err.message })
  }
})

export default router
