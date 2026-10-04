import { cloud } from './telegram'
import type { State } from './types'

const LS_KEY = 'coinly:state'
const META_KEY = 'meta'
const CHUNK = 4000 // лимит значения CloudStorage — 4096 символов
const MAX_CHUNKS = 500 // ключей всего 1024, два слота
const BATCH = 50

interface Meta {
  slot: 'a' | 'b'
  n: number
  at: number
}

function isState(x: unknown): x is State {
  const s = x as State
  return !!s && s.v === 1 && Array.isArray(s.coins) && Array.isArray(s.txs)
}

function readLocal(): State | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(LS_KEY) ?? 'null')
    return isState(parsed) ? parsed : null
  } catch {
    return null
  }
}

function writeLocal(state: State) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state))
  } catch {
    /* приватный режим / переполнение — живём без кэша */
  }
}

let lastMeta: Meta | null = null

async function readMeta(): Promise<Meta | null> {
  const res = await cloud!.getItems([META_KEY])
  return res[META_KEY] ? (JSON.parse(res[META_KEY]) as Meta) : null
}

async function readCloud(): Promise<State | null> {
  if (!cloud) return null
  const meta = await readMeta()
  if (!meta) return null
  const keys = Array.from({ length: meta.n }, (_, i) => `${meta.slot}${i}`)
  let json = ''
  for (let i = 0; i < keys.length; i += BATCH) {
    const batch = keys.slice(i, i + BATCH)
    const res = await cloud.getItems(batch)
    for (const k of batch) {
      if (res[k] == null) throw new Error(`CloudStorage: missing chunk ${k}`)
      json += res[k]
    }
  }
  lastMeta = meta
  const parsed = JSON.parse(json)
  return isState(parsed) ? parsed : null
}

async function writeCloud(state: State) {
  const store = cloud
  if (!store) return
  const json = JSON.stringify(state)
  const n = Math.ceil(json.length / CHUNK)
  if (n > MAX_CHUNKS) {
    console.warn('Coinly: данные превышают лимит CloudStorage, синхронизация пропущена')
    return
  }
  const prev = lastMeta ?? (await readMeta().catch(() => null))
  // Пишем в неактивный слот, затем переключаем meta — прерванная запись не портит данные
  const slot = prev?.slot === 'a' ? 'b' : 'a'
  for (let i = 0; i < n; i += BATCH) {
    await Promise.all(
      Array.from({ length: Math.min(BATCH, n - i) }, (_, j) =>
        store.setItem(`${slot}${i + j}`, json.slice((i + j) * CHUNK, (i + j + 1) * CHUNK)),
      ),
    )
  }
  const meta: Meta = { slot, n, at: state.updatedAt }
  await store.setItem(META_KEY, JSON.stringify(meta))
  lastMeta = meta
  const stale = (await store.getKeys()).filter((k) => {
    const m = /^([ab])(\d+)$/.exec(k)
    return m && m[1] === slot && Number(m[2]) >= n
  })
  if (stale.length) await store.removeItems(stale)
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))])
}

export async function loadState(): Promise<State | null> {
  const local = readLocal()
  try {
    const remote = await withTimeout(readCloud(), 4000)
    if (remote && (!local || remote.updatedAt > local.updatedAt)) {
      writeLocal(remote)
      return remote
    }
    if (local && (!remote || local.updatedAt > remote.updatedAt)) saveState(local)
  } catch (e) {
    console.warn('Coinly: не удалось прочитать CloudStorage', e)
  }
  return local
}

let timer: ReturnType<typeof setTimeout> | undefined
let pending: State | null = null
let writing = false

async function flush() {
  clearTimeout(timer)
  if (writing || !pending) return
  writing = true
  const state = pending
  pending = null
  try {
    await writeCloud(state)
  } catch (e) {
    console.error('Coinly: ошибка записи в CloudStorage', e)
    pending ??= state
  } finally {
    writing = false
    if (pending) timer = setTimeout(flush, 1000)
  }
}

export function saveState(state: State) {
  writeLocal(state)
  if (!cloud) return
  pending = state
  clearTimeout(timer)
  timer = setTimeout(flush, 1000)
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') void flush()
})

export const storageLabel = cloud ? 'Telegram Cloud' : 'Локально (браузер)'
