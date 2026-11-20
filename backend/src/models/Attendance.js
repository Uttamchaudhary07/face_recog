import { DataTypes } from 'sequelize'
import { sequelize } from '../db.js'
import { User } from './User.js'
import { AttendanceSession } from './AttendanceSession.js'

export const Attendance = sequelize.define('Attendance', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: User,
      key: 'id'
    }
  },
  sessionId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  }, 
  userIdText: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  role: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  method: {
    type: DataTypes.ENUM('face', 'barcode'),
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('present'),
    defaultValue: 'present'
  },
  timestamp: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  time: {
    type: DataTypes.STRING(20),
    allowNull: false
  }
}, {
  tableName: 'attendances',
  timestamps: true,
  indexes: [
    { name: 'attendances_user_session', unique: true, fields: ['userId', 'sessionId'] }
  ]
})

Attendance.belongsTo(User, { foreignKey: 'userId', as: 'user' })
Attendance.belongsTo(AttendanceSession, { foreignKey: 'sessionId', as: 'session', constraints: false })
