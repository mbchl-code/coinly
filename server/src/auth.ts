import { createHmac, timingSafeEqual } from 'node:crypto'

/** initData живёт, пока открыт Mini App; неделя — с запасом на вкладку, не закрытую на выходные */
const MAX_AGE_S = 7 * 24 * 60 * 60

/**
 * Проверяет подпись initData Telegram Mini App и возвращает id пользователя.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function verifyInitData(initData: string, botToken: string, now = Date.now()): number | null {
  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash) return null
  params.delete('hash')
  const check = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n')
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest()
  const expected = createHmac('sha256', secret).update(check).digest()
  const given = Buffer.from(hash, 'hex')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null

  const authDate = Number(params.get('auth_date'))
  if (!authDate || now / 1000 - authDate > MAX_AGE_S) return null
  try {
    const id = (JSON.parse(params.get('user') ?? 'null') as { id?: unknown } | null)?.id
    return typeof id === 'number' && Number.isSafeInteger(id) ? id : null
  } catch {
    return null
  }
}
