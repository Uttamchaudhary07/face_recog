import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { Op } from 'sequelize'
import { sequelize } from '../db.js'
import { User } from '../models/User.js'
import { BiometricAudit } from '../models/BiometricAudit.js'
import { isFaceDescriptor } from './face.js'

const DAY = 86400000

export const templateStatusFields = [
  [sequelize.literal("JSON_UNQUOTE(JSON_EXTRACT(faceDescriptor, '$.version'))"), 'templateVersion'],
  [sequelize.literal("JSON_UNQUOTE(JSON_EXTRACT(faceDescriptor, '$.enrolledAt'))"), 'templateEnrolledAt']
]

export function hasTemplateForUser(user) {
  return hasActiveTemplate({ version: Number(user.get('templateVersion')), enrolledAt: Number(user.get('templateEnrolledAt')) })
}

function encryptionKey() {
  const key = process.env.BIOMETRIC_ENCRYPTION_KEY || ''
  if (!/^[a-f0-9]{64}$/i.test(key)) throw new Error('BIOMETRIC_ENCRYPTION_KEY must be 64 hexadecimal characters')
  return Buffer.from(key, 'hex')
}

export function retentionDays() {
  const days = Number(process.env.BIOMETRIC_RETENTION_DAYS ?? 180)
  if (!Number.isInteger(days) || days < 1 || days > 3650) throw new Error('BIOMETRIC_RETENTION_DAYS must be between 1 and 3650')
  return days
}

export function verifyBiometricSettings() {
  encryptionKey()
  retentionDays()
}

export function hasActiveTemplate(template, now = Date.now()) {
  return template?.version === 1 && Number.isSafeInteger(template.enrolledAt) &&
    template.enrolledAt <= now && now - template.enrolledAt < retentionDays() * DAY
}

export function encryptTemplate(descriptor, userId, enrolledAt = Date.now()) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  cipher.setAAD(Buffer.from(`1:${userId}:${enrolledAt}`))
  const data = Buffer.concat([cipher.update(JSON.stringify(descriptor), 'utf8'), cipher.final()])
  return { version: 1, enrolledAt, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') }
}

export function decryptTemplate(template, userId) {
  if (!hasActiveTemplate(template)) return null
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(template.iv, 'base64'), { authTagLength: 16 })
  decipher.setAAD(Buffer.from(`1:${userId}:${template.enrolledAt}`))
  decipher.setAuthTag(Buffer.from(template.tag, 'base64'))
  const descriptor = JSON.parse(Buffer.concat([decipher.update(Buffer.from(template.data, 'base64')), decipher.final()]).toString('utf8'))
  return isFaceDescriptor(descriptor) ? descriptor : null
}

export async function maintainTemplates({ migrate = false } = {}) {
  if (migrate) encryptionKey()
  const now = Date.now()
  const cutoff = now - retentionDays() * DAY
  const expiredTemplate = sequelize.literal(
    `JSON_EXTRACT(faceDescriptor, '$.version') = 1 AND JSON_EXTRACT(faceDescriptor, '$.enrolledAt') <= ${cutoff}`
  )
  const users = await User.unscoped().findAll({
    attributes: ['id'],
    where: migrate ? { [Op.or]: [sequelize.literal("JSON_TYPE(faceDescriptor) = 'ARRAY'"), expiredTemplate] } : expiredTemplate
  })
  let encrypted = 0
  let expired = 0

  for (const { id } of users) {
    await sequelize.transaction(async (transaction) => {
      const user = await User.unscoped().findByPk(id, { attributes: ['id', 'faceDescriptor'], transaction, lock: true })
      const template = user?.faceDescriptor
      if (migrate && isFaceDescriptor(template)) {
        await user.update({ faceDescriptor: encryptTemplate(template, id, now) }, { transaction })
        await BiometricAudit.create({ action: 'migration', subjectId: id, outcome: 'encrypted' }, { transaction })
        encrypted++
      } else if (template?.version === 1 && template.enrolledAt <= cutoff) {
        await user.update({ faceDescriptor: null }, { transaction })
        await BiometricAudit.create({ action: 'expiration', subjectId: id, outcome: 'deleted' }, { transaction })
        expired++
      }
    })
  }
  return { encrypted, expired }
}
