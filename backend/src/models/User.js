import mongoose from 'mongoose'

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, trim: true, lowercase: true, unique: true, sparse: true },
  passwordHash: { type: String },
  role: { type: String, enum: ['admin', 'teacher', 'student', 'pending'], default: 'pending' },
  userId: {
    type: String,
    trim: true,
    uppercase: true,
    unique: true,
    sparse: true,
    immutable: true,
    match: [/^[A-Z0-9-]+$/, 'Invalid userId format']
  },
  barcode: { type: String, trim: true, uppercase: true },
  faceDescriptor: { type: [Number], default: undefined },
  subjects: { type: [String], default: [] },
  assignedStudents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true })

UserSchema.index({ userId: 1 }, { unique: true, sparse: true })
UserSchema.index({ barcode: 1 }, { unique: true, sparse: true })

export const User = mongoose.model('User', UserSchema)
