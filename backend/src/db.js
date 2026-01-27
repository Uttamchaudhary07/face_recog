import mongoose from 'mongoose'

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/face_recog_v1'

export async function connectDb(){
  if (mongoose.connection.readyState === 1) return
  await mongoose.connect(MONGO_URI)
}
