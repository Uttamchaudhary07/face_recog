import { Sequelize } from 'sequelize'
import mysql from 'mysql2'

const ssl = process.env.DB_SSL === 'true' ? { rejectUnauthorized: true, verifyIdentity: true } : undefined
if (ssl && process.env.DB_SSL_CA) ssl.ca = process.env.DB_SSL_CA.replace(/\\n/g, '\n')

const sequelize = new Sequelize(
  process.env.DB_NAME || 'face_recog',
  process.env.DB_USER || 'root',
  process.env.DB_PASSWORD || '',
  {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    dialect: 'mysql',
    dialectModule: mysql,
    dialectOptions: ssl ? { ssl } : {},
    logging: false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  }
)

export async function connectDb() {
  try {
    await sequelize.authenticate()
    await sequelize.sync({ alter: false })
    console.log('MySQL connected successfully')
  } catch (error) {
    console.error('Unable to connect to MySQL:', error)
    throw error
  }
}

export { sequelize }
