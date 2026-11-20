import bcrypt from 'bcryptjs'
import { connectDb } from './db.js'
import { User } from './models/User.js'
import './models/Attendance.js'
import { ensureStudentFields } from './utils/studentFieldsMigration.js'
import { maintainTemplates, verifyBiometricSettings } from './utils/biometrics.js'

export function verifyHostedSettings() {
  for (const name of ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'CORS_ORIGINS']) {
    if (!process.env[name]?.trim()) throw new Error(`${name} is required`)
  }
  if (['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST.trim())) throw new Error('Hosted MySQL requires a remote hostname')
  if (process.env.DB_SSL !== 'true') throw new Error('DB_SSL=true is required for hosted MySQL')
  if ((process.env.JWT_SECRET || '').length < 32) throw new Error('JWT_SECRET must be at least 32 characters')
}

export async function prepareDatabase() {
  const hosted = Boolean(process.env.VERCEL) || process.env.NODE_ENV === 'production'
  if (hosted) verifyHostedSettings()
  verifyBiometricSettings()
  const email = (process.env.ADMIN_EMAIL || (hosted ? '' : 'admin@example.com')).trim().toLowerCase()
  const password = process.env.ADMIN_PASSWORD || (hosted ? '' : 'admin123')
  if (!email || (hosted && password.length < 12)) throw new Error('Provide an admin email and a password of at least 12 characters')

  await connectDb()
  await ensureStudentFields()
  await maintainTemplates({ migrate: true })
  const passwordHash = await bcrypt.hash(password, 10)
  const [admin, created] = await User.findOrCreate({
    where: { email },
    defaults: { name: 'Admin', passwordHash, role: 'admin' }
  })
  if (!created && (admin.role !== 'admin' || !admin.passwordHash)) await admin.update({ role: 'admin', passwordHash })
}
