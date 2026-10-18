/**
 * Display formatting. The API returns UTC ISO timestamps; these helpers render
 * them in the viewer's local time zone and locale.
 */
const CURRENCY = import.meta.env.VITE_CURRENCY || 'USD'

const dateFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
const shortDateFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })
const currencyFormat = new Intl.NumberFormat(undefined, { style: 'currency', currency: CURRENCY, maximumFractionDigits: 2 })

export const formatDate = (iso) => (iso ? dateFormat.format(new Date(iso)) : '—')
export const formatShortDate = (iso) => (iso ? shortDateFormat.format(new Date(iso)) : '—')
export const formatTime = (iso) => (iso ? timeFormat.format(new Date(iso)) : '—')
export const formatDateTime = (iso) => (iso ? `${formatDate(iso)}, ${formatTime(iso)}` : '—')
export const formatTimeRange = (start, end) => `${formatTime(start)} – ${formatTime(end)}`

/** "2026-10-07" (a calendar date, not an instant) → Date at local midnight. */
export function parseLocalDate(value) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function formatCurrency(amount) {
  const value = Number(amount)
  return Number.isFinite(value) && value > 0 ? currencyFormat.format(value) : 'Not set'
}

export function formatDuration(seconds) {
  if (seconds == null) return '—'
  const minutes = Math.max(1, Math.round(seconds / 60))
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

export function formatClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(s / 3600)
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return hours ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`
}

export function formatRelative(iso) {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'Just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days} d ago`
  return formatShortDate(iso)
}

export function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')
}

export const doctorName = (name) => (name ? `Dr. ${name}` : '')

export function isSameLocalDay(iso, date = new Date()) {
  const d = new Date(iso)
  return d.getFullYear() === date.getFullYear() && d.getMonth() === date.getMonth() && d.getDate() === date.getDate()
}

export function greeting(date = new Date()) {
  const hour = date.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

/** "Today, 14:30", "Tomorrow, 09:00" or "Thu 9 Oct, 10:00". */
export function formatDayAndTime(iso) {
  const date = new Date(iso)
  const today = new Date()
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
  let day
  if (isSameLocalDay(iso, today)) day = 'Today'
  else if (isSameLocalDay(iso, tomorrow)) day = 'Tomorrow'
  else day = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).format(date)
  return `${day}, ${formatTime(iso)}`
}

/** Adds days to a "YYYY-MM-DD" calendar date and returns the same format. */
export function addDays(value, days) {
  const date = parseLocalDate(value)
  date.setDate(date.getDate() + days)
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${mm}-${dd}`
}

/** "09:00:00" → "09:00" */
export const shortTime = (value) => (value ? value.slice(0, 5) : '')
