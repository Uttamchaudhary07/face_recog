import { DataTypes, Op } from 'sequelize'
import { sequelize } from '../db.js'

export const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  email: {
    type: DataTypes.STRING(255),
    unique: true,
    allowNull: true
  },
  passwordHash: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  role: {
    type: DataTypes.ENUM('admin', 'teacher', 'student', 'pending'),
    defaultValue: 'pending'
  },
  userId: {
    type: DataTypes.STRING(50),
    unique: true,
    allowNull: true
  },
  barcode: {
    type: DataTypes.STRING(100),
    unique: true,
    allowNull: true
  },
  faceDescriptor: {
    type: DataTypes.JSON,
    allowNull: true,
    get() {
      const raw = this.getDataValue('faceDescriptor')
      return raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null
    }
  },
  subjects: {
    type: DataTypes.JSON,
    defaultValue: [],
    get() {
      const raw = this.getDataValue('subjects')
      return raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : []
    }
  },
  assignedStudents: {
    type: DataTypes.JSON,
    defaultValue: [],
    get() {
      const raw = this.getDataValue('assignedStudents')
      return raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : []
    }
  }
}, {
  tableName: 'users',
  timestamps: true
})
