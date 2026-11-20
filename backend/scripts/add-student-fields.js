import 'dotenv/config'
import { sequelize } from '../src/db.js'
import { ensureStudentFields } from '../src/utils/studentFieldsMigration.js'

try {
  await ensureStudentFields()
  console.log('Student fields are available in MySQL')
} catch (error) {
  console.error('Unable to add student fields:', error.original?.code || error.message)
  process.exitCode = 1
} finally {
  await sequelize.close()
}
