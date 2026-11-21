import { DataTypes } from 'sequelize'
import { sequelize } from '../db.js'

export const AttendanceSession = sequelize.define('AttendanceSession', {
  code: { type: DataTypes.STRING(12), allowNull: false, unique: true },
  subject: { type: DataTypes.STRING(100), allowNull: false },
  createdBy: { type: DataTypes.INTEGER, allowNull: false },
  expiresAt: { type: DataTypes.DATE, allowNull: false }
}, {
  tableName: 'attendance_sessions'
})
