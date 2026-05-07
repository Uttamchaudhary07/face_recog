import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import bcrypt from 'bcryptjs'
import { connectDb } from './db.js'
import { User } from './models/User.js'
import authRoutes from './routes/auth.js'
import adminRoutes from './routes/admin.js'
import attendanceRoutes from './routes/attendance.js'

const app = express()
app.use(cors())
app.use(express.json({ limit: '10mb' }))

app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', service: 'face-recog-backend' })
})

app.use('/api/auth', authRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/attendance', attendanceRoutes)

const PORT = process.env.PORT || 5001

async function ensureAdmin() {
  const email = process.env.ADMIN_EMAIL || 'admin@example.com'
  const password = process.env.ADMIN_PASSWORD || 'admin123'
  const existing = await User.findOne({ where: { email } })
  const passwordHash = await bcrypt.hash(password, 10)
  if (!existing) {
    await User.create({
      name: 'Admin',
      email,
      passwordHash,
      role: 'admin'
    })
    console.log('Created default admin:', email)
    return
  }
  if (existing.role !== 'admin' || !existing.passwordHash) {
    await existing.update({
      role: 'admin',
      passwordHash
    })
    console.log('Updated admin account:', email)
  }
}

connectDb()
  .then(async () => {
    await ensureAdmin()
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Backend running on http://0.0.0.0:${PORT}`)
    })
  })
  .catch((err) => {
    console.error('Failed to start server:', err)
    process.exit(1)
  })
