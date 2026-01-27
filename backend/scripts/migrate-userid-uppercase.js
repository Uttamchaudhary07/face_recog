import 'dotenv/config'
import mongoose from 'mongoose'
import { connectDb } from '../src/db.js'
import { User } from '../src/models/User.js'
import { Attendance } from '../src/models/Attendance.js'

async function run(){
  await connectDb()

  const users = await User.find()
  const userUpdates = users
    .filter((u) => u.userId && u.userId !== u.userId.toUpperCase())
    .map((u) => ({
      updateOne: {
        filter: { _id: u._id },
        update: { $set: { userId: u.userId.toUpperCase() } }
      }
    }))

  const barcodeUpdates = users
    .filter((u) => u.barcode && u.barcode !== u.barcode.toUpperCase())
    .map((u) => ({
      updateOne: {
        filter: { _id: u._id },
        update: { $set: { barcode: u.barcode.toUpperCase() } }
      }
    }))

  if (userUpdates.length){
    await User.bulkWrite(userUpdates)
  }
  if (barcodeUpdates.length){
    await User.bulkWrite(barcodeUpdates)
  }

  const attendance = await Attendance.find()
  const attendanceUpdates = []
  for (const log of attendance){
    if (!log.user) continue
    const user = users.find((u) => u._id.toString() === log.user.toString())
    if (!user || !user.userId) continue
    const normalized = user.userId.toUpperCase()
    if (log.userId !== normalized){
      attendanceUpdates.push({
        updateOne: {
          filter: { _id: log._id },
          update: { $set: { userId: normalized } }
        }
      })
    }
  }

  if (attendanceUpdates.length){
    await Attendance.bulkWrite(attendanceUpdates)
  }

  console.log(`Updated userIds: ${userUpdates.length}, barcodes: ${barcodeUpdates.length}, attendance: ${attendanceUpdates.length}`)
  await mongoose.disconnect()
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
