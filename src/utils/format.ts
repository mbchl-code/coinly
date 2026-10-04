const cache = new Map<string, Intl.NumberFormat>()

function fmt(currency: string, digits: number) {
  const key = `${currency}:${digits}`
  let f = cache.get(key)
  if (!f) {
    try {
      f = new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency,
        currencyDisplay: 'narrowSymbol',
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })
    } catch {
      f = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits })
    }
    cache.set(key, f)
  }
  return f
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** 1 234,50 ₽ — копейки только если есть */
/** Типографский минус вместо дефиса — как в остальном интерфейсе */
const minus = (s: string) => s.replace('-', '−')

export function money(n: number, currency: string) {
  const v = round2(n)
  return minus(fmt(currency, Number.isInteger(v) ? 0 : 2).format(v))
}

/** Компактно для монет: 12,3 тыс. ₽ */
export function moneyShort(n: number, currency: string) {
  const v = round2(n)
  if (Math.abs(v) < 100_000) return minus(fmt(currency, Number.isInteger(v) || Math.abs(v) >= 1000 ? 0 : 2).format(v))
  const unit = Math.abs(v) >= 1_000_000 ? 'млн' : 'тыс.'
  const div = unit === 'млн' ? 1_000_000 : 1000
  const sym = fmt(currency, 0).formatToParts(0).find((p) => p.type === 'currency')?.value ?? currency
  return minus(`${(v / div).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} ${unit} ${sym}`)
}

export function currencySymbol(currency: string) {
  return fmt(currency, 0).formatToParts(0).find((p) => p.type === 'currency')?.value ?? currency
}
