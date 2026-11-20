import 'dotenv/config'
import { sequelize } from '../src/db.js'
import { prepareDatabase } from '../src/setup.js'

try {
  await prepareDatabase()
  console.log('Attendance database is ready')
} catch (error) {
  console.error('Database preparation failed:', error.original?.code || error.message)
  process.exitCode = 1
} finally {
  await sequelize.close()
}
