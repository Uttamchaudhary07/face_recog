const IST = 'Asia/Kolkata'

/**
 * Returns current date and time in IST.
 * Uses Intl API so it works correctly on any server timezone.
 */
export function nowIST() {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: IST,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  }).formatToParts(now)

  const p = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  // hour12:false returns '24' at midnight in some environments — normalize
  const hour = p.hour === '24' ? '00' : p.hour
  const date = `${p.year}-${p.month}-${p.day}`
  const time = `${hour}:${p.minute}:${p.second}`
  return { now, date, time }
}

/** Returns today's date string (YYYY-MM-DD) in IST. */
export function todayIST() {
  return nowIST().date
}
