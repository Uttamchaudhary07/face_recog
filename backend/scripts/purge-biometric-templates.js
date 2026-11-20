import 'dotenv/config'
import { sequelize } from '../src/db.js'
import { maintainTemplates } from '../src/utils/biometrics.js'

try {
  const { expired } = await maintainTemplates()
  console.log(`Expired face templates removed: ${expired}`)
} catch (error) {
  console.error('Unable to remove expired face templates:', error.name)
  process.exitCode = 1
} finally {
  await sequelize.close()
}
