import { nowIST } from './date.js'

const DAY = 86_400_000
const REPORT_DAYS = 90
const FORECAST_SESSIONS = 5

export function assignedIds(user) {
  return (user?.assignedStudents || []).map((value) => Number(value?.id ?? value)).filter(Number.isSafeInteger)
}

export function attendanceTarget() {
  const target = Number(process.env.ATTENDANCE_TARGET_PERCENT ?? 75)
  if (!Number.isFinite(target) || target <= 0 || target > 100) throw new Error('ATTENDANCE_TARGET_PERCENT must be greater than 0 and at most 100')
  return target
}

export function reportWindow(now = new Date()) {
  const end = nowIST(now).date
  const start = new Date(Date.parse(end) - (REPORT_DAYS - 1) * DAY).toISOString().slice(0, 10)
  return { start, end }
}

function percent(present, total) {
  return total ? Math.round(present * 1000 / total) / 10 : null
}

export function buildAttendanceReports(students, sessions, creators, records, { target, now, detailed }) {
  const creatorById = new Map(creators.map(creator => [creator.id, {
    role: creator.role,
    assigned: new Set(assignedIds(creator))
  }]))
  const sessionsByStudent = new Map()
  for (const { userId, sessionId } of records) {
    if (!sessionsByStudent.has(userId)) sessionsByStudent.set(userId, new Set())
    sessionsByStudent.get(userId).add(sessionId)
  }

  const reports = students.map(student => {
    const attended = sessionsByStudent.get(student.id)
    const timeline = []
    for (const session of sessions) {
      const present = attended?.has(session.id) === true
      const creator = creatorById.get(session.createdBy)
      const expected = creator?.role === 'admin' || (creator?.role === 'teacher' && creator.assigned.has(student.id))
      if (present || (expected && session.createdAt >= student.createdAt && session.expiresAt <= now)) {
        timeline.push({ id: session.id, date: session.date, subject: session.subject, present })
      }
    }

    const totalSessions = timeline.length
    const attendedSessions = timeline.filter(session => session.present).length
    const currentRate = percent(attendedSessions, totalSessions)
    const summary = { id: student.id, name: student.name, userId: student.userId, totalSessions, attendedSessions, currentRate }
    if (!detailed) return summary

    const recent = timeline.slice(-FORECAST_SESSIONS)
    const recentRate = percent(recent.filter(session => session.present).length, recent.length)
    const previous = timeline.slice(-FORECAST_SESSIONS * 2, -FORECAST_SESSIONS)
    const trend = previous.length === FORECAST_SESSIONS
      ? Math.round((recentRate - percent(previous.filter(session => session.present).length, previous.length)) * 10) / 10
      : null
    const projectedRate = totalSessions >= FORECAST_SESSIONS
      ? Math.round((0.7 * recentRate + 0.3 * currentRate) * 10) / 10
      : null
    const alerts = []
    if (currentRate !== null && currentRate < target) alerts.push('Attendance is below the target.')
    if (projectedRate !== null && projectedRate < target) alerts.push('Projected attendance is below the target.')
    if (totalSessions >= 3 && timeline.slice(-3).every(session => !session.present)) alerts.push('You missed the last three sessions.')
    if (trend !== null && trend <= -15) alerts.push('Attendance has dropped by at least 15 percentage points.')
    return { ...summary, trend, projectedRate, alerts, timeline }
  })

  if (detailed) return reports
  return reports.filter(student => student.currentRate !== null && student.currentRate < target)
    .sort((left, right) => left.currentRate - right.currentRate)
}
