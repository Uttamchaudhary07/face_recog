import { sequelize } from '../db.js'
import { User } from '../models/User.js'

export async function ensureStudentFields() {
  const query = sequelize.getQueryInterface()
  const columns = await query.describeTable('users')
  for (const name of ['department', 'semester', 'section']) {
    if (Object.hasOwn(columns, name)) continue

    const { type, allowNull } = User.rawAttributes[name]
    try {
      await query.addColumn('users', name, { type, allowNull })
    } catch (error) {
      if (error.original?.code !== 'ER_DUP_FIELDNAME') throw error
    }
  }
}
