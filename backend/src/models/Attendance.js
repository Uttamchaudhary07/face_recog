import { DataTypes } from 'sequelize'
import { sequelize } from '../db.js'
import { User } from './User.js'

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
    { unique: true, fields: ['userId', 'date'] }
  ]
})

Attendance.belongsTo(User, { foreignKey: 'userId', as: 'user' })
