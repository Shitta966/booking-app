const TIME_ZONE = 'Africa/Lagos'

export function formatMoney(amountMinor: number, currency = 'NGN') {
  if (amountMinor === 0) return 'Free'
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amountMinor / 100)
}

export function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat('en-NG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: TIME_ZONE }).format(new Date(value))
}

export function formatShortDate(value: Date | string) {
  return new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', timeZone: TIME_ZONE }).format(new Date(value))
}

export function formatTime(value: Date | string) {
  return new Intl.DateTimeFormat('en-NG', { hour: 'numeric', minute: '2-digit', timeZone: TIME_ZONE }).format(new Date(value))
}

export function formatDateTime(value: Date | string) {
  return `${formatDate(value)} · ${formatTime(value)}`
}

/** Value for <input type="datetime-local"> in Lagos time. */
export function toLagosInput(value: Date | string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(value))
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '00'
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`
}

/** Parses a datetime-local value entered in Lagos time (UTC+1, no DST). */
export function fromLagosInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null
  const date = new Date(`${value}:00+01:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

export function slugify(value: string) {
  return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'org'
}

export function nairaToMinor(value: string) {
  const amount = Number(value.replace(/[,\s₦]/g, ''))
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : null
}
