import { Sequelize } from 'sequelize'

const sequelize = new Sequelize(
  process.env.DB_NAME || 'face_recog',
  process.env.DB_USER || 'root',
  process.env.DB_PASSWORD || '',
  {
    host: process.env.DB_HOST || 'localhost',
    dialect: 'mysql',
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
