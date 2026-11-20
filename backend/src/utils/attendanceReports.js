import { nowIST } from './date.js'

const DAY = 86400000
export const REPORT_DAYS = 90
export const MIN_OBSERVED_DAYS = 5

export function cohortKey(student) {
  if (!student.department || !student.semester) return null
  return JSON.stringify([student.department.trim().toLowerCase(), student.semester, student.section?.trim().toLowerCase() || ''])
}

export function attendanceTarget() {
  const target = Number(process.env.ATTENDANCE_TARGET_PERCENT ?? 75)
  if (!Number.isFinite(target) || target <= 0 || target > 100) throw new Error('ATTENDANCE_TARGET_PERCENT must be greater than 0 and at most 100')
  return target
}

export function reportWindow(now = new Date()) {
  const today = nowIST(now).date
  return { start: new Date(Date.parse(today) - REPORT_DAYS * DAY).toISOString().slice(0, 10), before: today }
}

function percent(values) {
  return values.length ? Math.round(values.filter(Boolean).length * 1000 / values.length) / 10 : null
}

export function buildAttendanceReports(students, cohortMembers, records, target) {
  const cohortByStudent = new Map(cohortMembers.map((student) => [student.id, cohortKey(student)]))
  const daysByCohort = new Map()
  const presentByStudent = new Map()
  for (const record of records) {
    if (!presentByStudent.has(record.userId)) presentByStudent.set(record.userId, new Set())
    presentByStudent.get(record.userId).add(record.date)
    const cohort = cohortByStudent.get(record.userId)
    if (!cohort) continue
    if (!daysByCohort.has(cohort)) daysByCohort.set(cohort, new Set())
    daysByCohort.get(cohort).add(record.date)
  }
  const cohortDays = new Map([...daysByCohort].map(([cohort, days]) => [cohort, [...days].sort()]))

  return students.map(({ id, name, userId, department, semester, section, createdAt }) => {
    const from = nowIST(new Date(createdAt)).date
    const present = presentByStudent.get(id) || new Set()
    const cohort = cohortByStudent.get(id)
    const timeline = (cohortDays.get(cohort) || []).filter((date) => date >= from).map((date) => ({ date, present: present.has(date) }))
    const flags = timeline.map((day) => day.present)
    const currentRate = percent(flags)
    const recentRate = percent(flags.slice(-5))
    const previousRate = flags.length >= 10 ? percent(flags.slice(-10, -5)) : null
    const trend = previousRate === null ? null : Math.round((recentRate - previousRate) * 10) / 10
    const projectedRate = flags.length >= MIN_OBSERVED_DAYS ? Math.round((0.7 * recentRate + 0.3 * currentRate) * 10) / 10 : null
    const alerts = []
    if (projectedRate !== null) {
      if (currentRate < target) alerts.push('Observed attendance is below the target.')
      if (projectedRate < target) alerts.push('Projected attendance is below the target.')
      if (flags.slice(-3).every((flag) => !flag)) alerts.push('No attendance was recorded on the last three observed days.')
      if (trend !== null && trend <= -15) alerts.push('Attendance has dropped by at least 15 percentage points.')
    }
    return { id, name, userId, department, semester, section, presentDays: present.size, observedDays: flags.length, currentRate, trend, projectedRate, alerts, timeline }
  })
}
