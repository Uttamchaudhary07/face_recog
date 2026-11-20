import 'dotenv/config'
import { pathToFileURL } from 'node:url'
import express from 'express'
import cors from 'cors'
import { sequelize } from './db.js'
import authRoutes from './routes/auth.js'
import adminRoutes from './routes/admin.js'
import attendanceRoutes from './routes/attendance.js'
import { maintainTemplates, verifyBiometricSettings } from './utils/biometrics.js'
import { prepareDatabase, verifyHostedSettings } from './setup.js'

const app = express()
const hosted = Boolean(process.env.VERCEL) || process.env.NODE_ENV === 'production'
const allowedOrigins = (process.env.CORS_ORIGINS || '').split(',').map((origin) => origin.trim()).filter(Boolean)
app.use(cors({
  origin: (origin, allow) => allow(null, !origin || allowedOrigins.includes(origin) || (!hosted && !allowedOrigins.length))
}))
app.use(express.json({ limit: '4mb' }))

app.use('/api', (req, res, next) => {
  if (hosted) {
    try {
      verifyHostedSettings()
      verifyBiometricSettings()
    } catch (error) {
      console.error('Deployment configuration is incomplete:', error.message)
      return res.status(503).json({ message: 'Attendance service configuration is incomplete' })
    }
  }
  next()
})

app.get('/api/health', async (req, res) => {
  try {
    await sequelize.authenticate()
    return res.json({ status: 'healthy', service: 'face-recog-backend' })
  } catch {
    return res.status(503).json({ status: 'unavailable', service: 'face-recog-backend' })
  }
})

app.get('/api/cron/purge-biometrics', async (req, res) => {
  const secret = process.env.CRON_SECRET
  if (!secret || req.get('authorization') !== `Bearer ${secret}`) {
    return res.status(401).json({ message: 'Unauthorized' })
  }
  try {
    return res.json(await maintainTemplates())
  } catch (error) {
    console.error('Biometric retention cleanup failed:', error.name)
    return res.status(500).json({ message: 'Biometric retention cleanup failed' })
  }
})

app.use('/api/auth', authRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/attendance', attendanceRoutes)

if (!process.env.VERCEL && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = process.env.PORT || 5001
  prepareDatabase().then(() => {
    app.listen(port, '0.0.0.0', () => console.log(`Backend running on http://0.0.0.0:${port}`))
    setInterval(() => {
      maintainTemplates().catch((err) => console.error('Biometric retention cleanup failed:', err.name))
    }, 60 * 60 * 1000).unref()
  }).catch((err) => {
    console.error('Failed to start server:', err.message)
    process.exit(1)
  })
}

export default app
