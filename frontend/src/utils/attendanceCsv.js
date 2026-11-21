export function exportAttendanceLogs(logs, range) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  const days = { weekly: 7, monthly: 30 }[range]
  const cutoff = days ? new Date(Date.parse(today) - (days - 1) * 86_400_000).toISOString().slice(0, 10) : null
  const entries = cutoff ? logs.filter(log => log.date >= cutoff) : logs
  if (!entries.length) return false

  const headers = ['Name', 'User ID (USN)', 'Subject', 'Method', 'Date (IST)', 'Time (IST)']
  const rows = entries.map(log => [log.name, log.userIdText, log.session?.subject, log.method, log.date, log.time])
  const escape = value => `"${String(value ?? '').replace(/"/g, '""')}"`
  const csv = [headers, ...rows].map(row => row.map(escape).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `attendance-logs-${range}-${today}.csv`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return true
}
