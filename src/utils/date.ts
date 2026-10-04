const pad = (n: number) => String(n).padStart(2, '0')

export const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const todayISO = () => toISO(new Date())
export const monthOf = (date: string) => date.slice(0, 7)
export const currentMonth = () => monthOf(todayISO())

export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

const monthFmt = new Intl.DateTimeFormat('ru-RU', { month: 'long' })
const dayFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' })
const weekdayFmt = new Intl.DateTimeFormat('ru-RU', { weekday: 'long' })
const shortFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' })

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const parse = (date: string) => {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function monthLabel(month: string) {
  const [y, m] = month.split('-').map(Number)
  const name = cap(monthFmt.format(new Date(y, m - 1, 1)))
  return y === new Date().getFullYear() ? name : `${name} ${y}`
}

export function dayLabel(date: string) {
  const today = todayISO()
  const y = new Date()
  y.setDate(y.getDate() - 1)
  if (date === today) return 'Сегодня'
  if (date === toISO(y)) return 'Вчера'
  const d = parse(date)
  return `${dayFmt.format(d)}, ${weekdayFmt.format(d)}`
}

export function shortDate(date: string) {
  const today = todayISO()
  if (date === today) return 'Сегодня'
  const y = new Date()
  y.setDate(y.getDate() - 1)
  if (date === toISO(y)) return 'Вчера'
  return shortFmt.format(parse(date))
}
