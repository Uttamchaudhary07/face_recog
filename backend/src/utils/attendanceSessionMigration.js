import { DataTypes } from 'sequelize'

export async function ensureAttendanceSessionColumn(query) {
  if (!(await query.showAllTables()).includes('attendances')) return

  const columns = await query.describeTable('attendances')
  if (Object.hasOwn(columns, 'sessionId')) return

  try {
    await query.addColumn('attendances', 'sessionId', { type: DataTypes.INTEGER, allowNull: true })
  } catch (error) {
    if (error.original?.code !== 'ER_DUP_FIELDNAME') throw error
  }
}

export async function removeDailyAttendanceConstraint(query) {
  const indexes = await query.showIndex('attendances')
  const dailyIndex = indexes.find(({ unique, fields }) =>
    unique && fields.length === 2 && fields[0].attribute === 'userId' && fields[1].attribute === 'date')
  if (!dailyIndex) return

  try {
    await query.removeIndex('attendances', dailyIndex.name)
  } catch (error) {
    if (error.original?.code !== 'ER_CANT_DROP_FIELD_OR_KEY') throw error
  }
}
