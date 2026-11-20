export function validateStudentDetails(input, existing = {}) {
  const values = {}

  for (const [field, limit] of [['department', 100], ['section', 30]]) {
    if (input[field] === undefined) continue
    const value = input[field]
    if (value !== null && (typeof value !== 'string' || value.trim().length > limit)) {
      return { error: `${field === 'department' ? 'Department' : 'Section'} must be at most ${limit} characters` }
    }
    values[field] = value?.trim() || null
  }

  if (input.semester !== undefined) {
    const semester = input.semester
    const number = typeof semester === 'number' || typeof semester === 'string' ? Number(semester) : NaN
    if (!Number.isInteger(number) || number < 1 || number > 255) {
      return { error: 'Semester must be a positive whole number up to 255' }
    }
    values.semester = number
  }

  const details = { ...existing, ...values }
  if (!details.department || !details.semester) return { error: 'Department and semester are required for students' }
  return { values }
}
