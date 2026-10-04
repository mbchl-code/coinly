const SOURCES = [
  (base: string) => `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${base}.min.json`,
  (base: string) => `https://latest.currency-api.pages.dev/v1/currencies/${base}.min.json`,
]

export const RATES_TTL = 12 * 60 * 60 * 1000

/** Курсы в виде «сколько базовой валюты за 1 единицу кода» */
export async function fetchRates(base: string, codes: string[]): Promise<Record<string, number>> {
  const b = base.toLowerCase()
  let lastError: unknown
  for (const url of SOURCES) {
    try {
      const res = await fetch(url(b))
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as Record<string, Record<string, number>>
      const table = data[b]
      const out: Record<string, number> = {}
      for (const code of codes) {
        const perBase = table?.[code.toLowerCase()]
        if (perBase) out[code] = 1 / perBase
      }
      return out
    } catch (e) {
      lastError = e
    }
  }
  throw lastError
}
