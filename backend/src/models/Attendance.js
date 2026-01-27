import mongoose from 'mongoose'

const AttendanceSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  userId: { type: String, trim: true, uppercase: true },
  role: { type: String },
  method: { type: String, enum: ['face', 'barcode'], required: true },
  status: { type: String, enum: ['present'], default: 'present', required: true },
  timestamp: { type: Date, default: Date.now },
  date: { type: String, required: true },
  time: { type: String, required: true }
}, { timestamps: true })

AttendanceSchema.index({ user: 1, date: 1 }, { unique: true })

export const Attendance = mongoose.model('Attendance', AttendanceSchema)
