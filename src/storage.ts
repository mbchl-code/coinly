import { createDefaultState } from './defaults'
import { diag } from './diag'
import { applyChanges, mergeStates, type Batch, type Change } from './sync'
import { cloud, tg } from './telegram'
import type { State } from './types'

/**
 * Данные живут на сервере Coinly (SQLite). Устройство хранит только кэш последнего
 * ответа сервера и очередь неотправленных изменений — и никогда не шлёт состояние целиком.
 * Вне Telegram (браузер, разработка) приложение работает локально, без сервера.
 */
const CACHE_KEY = 'coinly:cache'
const OUTBOX_KEY = 'coinly:outbox'
/** Старое локальное хранилище — до переезда на сервер и в режиме без Telegram */
const LEGACY_KEY = 'coinly:state'

const initData = tg?.initData ?? ''
export const online = !!initData

export const storageLabel = online ? 'Сервер Coinly' : 'Локально (браузер)'

function isState(x: unknown): x is State {
  const s = x as State
  return !!s && s.v === 1 && Array.isArray(s.coins) && Array.isArray(s.txs)
}

function readJson<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* приватный режим / переполнение — живём без кэша */
  }
}

// ---------- статус синхронизации ----------

export interface SyncStatus {
  pending: number
  /** Сервер недоступен (нет сети / ошибка) */
  offline: boolean
  /** Сервер отклонил подпись Telegram — нужно перезапустить приложение */
  authError: boolean
}

let status: SyncStatus = { pending: 0, offline: false, authError: false }
const statusListeners = new Set<(s: SyncStatus) => void>()

function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch }
  statusListeners.forEach((l) => l(status))
}

export function subscribeStatus(l: (s: SyncStatus) => void) {
  statusListeners.add(l)
  l(status)
  return () => void statusListeners.delete(l)
}

// ---------- запросы к серверу ----------

class HttpError extends Error {
  status: number
  constructor(status: number) {
    super(`HTTP ${status}`)
    this.status = status
  }
}

async function api<T>(method: string, path: string, body?: unknown, timeout = 10000): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)
  try {
    const res = await fetch(`./api/${path}`, {
      method,
      headers: { Authorization: `tma ${initData}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    })
    if (res.status === 401) setStatus({ authError: true })
    if (!res.ok) throw new HttpError(res.status)
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

interface Snapshot {
  baseCurrency: string
  rates: Record<string, number>
  ratesAt: number
  coins: State['coins']
  txs: State['txs']
}

const toState = (s: Snapshot): State => ({ v: 1, ...s, updatedAt: Date.now() })

// ---------- очередь изменений ----------

let outbox: Batch[] = readJson<Batch[]>(OUTBOX_KEY) ?? []
setStatus({ pending: outbox.length })

function saveOutbox() {
  writeJson(OUTBOX_KEY, outbox)
  setStatus({ pending: outbox.length })
}

/** Кэш — последнее подтверждённое сервером состояние (без неотправленных изменений) */
let cache: State | null = readJson<State>(CACHE_KEY)

function setCache(s: State) {
  cache = s
  writeJson(CACHE_KEY, s)
}

const withPending = (s: State) => outbox.reduce((acc, b) => applyChanges(acc, b.changes), s)

let remoteListener: ((s: State) => void) | null = null
/** Store подписывается, чтобы получать свежие данные с сервера (например, внесённые с другого устройства) */
export function onRemoteState(l: (s: State) => void) {
  remoteListener = l
}

let flushing = false
let retryTimer: ReturnType<typeof setTimeout> | undefined
let retryDelay = 1000

async function flush() {
  clearTimeout(retryTimer)
  if (flushing || !online) return
  flushing = true
  try {
    while (outbox.length) {
      const batch = outbox[0]
      try {
        await api('POST', 'ops', batch)
      } catch (e) {
        if (e instanceof HttpError && e.status === 400) {
          // Сервер счёл изменение некорректным — повтор не поможет; оставляем след в диагностике
          diag('sync-rejected', `${batch.kind} ${JSON.stringify(batch.changes).slice(0, 300)}`)
        } else {
          throw e
        }
      }
      outbox.shift()
      saveOutbox()
      if (cache) setCache(applyChanges(cache, batch.changes))
    }
    retryDelay = 1000
    setStatus({ offline: false })
    await refresh()
  } catch (e) {
    console.warn('Coinly: не удалось отправить изменения', e)
    setStatus({ offline: true })
    if (!status.authError) {
      retryTimer = setTimeout(flush, retryDelay)
      retryDelay = Math.min(retryDelay * 2, 60000)
    }
  } finally {
    flushing = false
  }
}

/** Забирает состояние с сервера; если в очереди ничего нет — отдаёт его в Store */
async function refresh() {
  const snap = await api<Snapshot | { empty: true }>('GET', 'state')
  if ('empty' in snap) return
  setCache(toState(snap))
  setStatus({ offline: false })
  if (!outbox.length && cache) remoteListener?.(cache)
}

/** Записывает действие пользователя в очередь и отправляет на сервер */
export function record(kind: string, changes: Change[], next: State) {
  if (!online) {
    writeJson(LEGACY_KEY, next)
    return
  }
  if (!changes.length) return
  outbox.push({ opId: crypto.randomUUID(), kind, changes })
  saveOutbox()
  void flush()
}

export function saveRates(rates: Record<string, number>, ratesAt: number, next: State) {
  if (!online) return writeJson(LEGACY_KEY, next)
  if (cache) setCache({ ...cache, rates: { ...cache.rates, ...rates }, ratesAt })
  api('PUT', 'rates', { rates, ratesAt }).catch((e) => console.warn('Coinly: курсы не сохранились', e))
}

// ---------- первый запуск: переезд из Telegram CloudStorage ----------

/** Старый формат CloudStorage: meta + чанки в слоте a/b. Только чтение */
async function readLegacyCloud(): Promise<State | null> {
  if (!cloud) return null
  const res = await cloud.getItems(['meta'])
  if (!res.meta) return null
  const meta = JSON.parse(res.meta) as { slot: string; n: number }
  const keys = Array.from({ length: meta.n }, (_, i) => `${meta.slot}${i}`)
  let json = ''
  for (let i = 0; i < keys.length; i += 50) {
    const batch = keys.slice(i, i + 50)
    const part = await cloud.getItems(batch)
    for (const k of batch) {
      if (part[k] == null) throw new Error(`CloudStorage: missing chunk ${k}`)
      json += part[k]
    }
  }
  const parsed = JSON.parse(json)
  return isState(parsed) ? parsed : null
}

async function migrate(): Promise<void> {
  const local = readJson<unknown>(LEGACY_KEY)
  let remote: State | null = null
  try {
    remote = await readLegacyCloud()
  } catch (e) {
    diag('migrate-cloud-failed', String(e))
  }
  const sources = [remote, isState(local) ? local : null].filter((s): s is State => !!s)
  sources.sort((a, b) => b.txs.length - a.txs.length)
  const state = sources.length ? sources.reduce(mergeStates) : createDefaultState()
  diag('migrate', `cloud ${remote?.txs.length ?? '-'} local ${isState(local) ? local.txs.length : '-'} → ${state.txs.length}`)
  await api('POST', 'import', {
    opId: crypto.randomUUID(),
    state: { baseCurrency: state.baseCurrency, coins: state.coins, txs: state.txs },
  })
  if (Object.keys(state.rates).length) await api('PUT', 'rates', { rates: state.rates, ratesAt: state.ratesAt })
}

// ---------- загрузка ----------

export async function loadState(): Promise<State> {
  if (!online) {
    const local = readJson<unknown>(LEGACY_KEY)
    return isState(local) ? local : createDefaultState()
  }
  try {
    let snap = await api<Snapshot | { empty: true }>('GET', 'state')
    if ('empty' in snap) {
      await migrate()
      snap = await api<Snapshot>('GET', 'state')
      if ('empty' in snap) throw new Error('import did not create the account')
    }
    setCache(toState(snap))
    setStatus({ offline: false })
  } catch (e) {
    // Без сервера показываем последнее, что от него получали. Пустое состояние НЕ создаём:
    // оно ушло бы на сервер как правда
    if (!cache) throw e
    console.warn('Coinly: сервер недоступен, показываю кэш', e)
    setStatus({ offline: true })
  }
  if (outbox.length) void flush()
  return withPending(cache!)
}

if (online) {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    if (outbox.length) void flush()
    else refresh().catch(() => setStatus({ offline: true }))
  })
}
