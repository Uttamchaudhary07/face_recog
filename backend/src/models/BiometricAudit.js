import { DataTypes } from 'sequelize'
import { sequelize } from '../db.js'

export const BiometricAudit = sequelize.define('BiometricAudit', {
  action: { type: DataTypes.STRING(24), allowNull: false },
  outcome: { type: DataTypes.STRING(24), allowNull: false },
  actorId: DataTypes.INTEGER,
  subjectId: DataTypes.INTEGER,
  templateCount: DataTypes.INTEGER
}, {
  tableName: 'biometric_audit',
  updatedAt: false,
  indexes: [{ fields: ['createdAt'] }]
})
