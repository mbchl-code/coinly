import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

type Json = Record<string, unknown>

/** Изменение одной сущности. Клиент шлёт их пачкой на каждое действие пользователя */
export type Change =
  | { t: 'putCoin'; coin: Json & { id: string } }
  | { t: 'delCoin'; id: string }
  | { t: 'order'; ids: string[] }
  | { t: 'putTx'; tx: Json & { id: string } }
  | { t: 'delTx'; id: string }
  | { t: 'base'; currency: string }

export interface Batch {
  opId: string
  kind: string
  changes: Change[]
}

export interface Snapshot {
  baseCurrency: string
  rates: Record<string, number>
  ratesAt: number
  coins: Json[]
  txs: Json[]
}

const SCHEMA = `
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  CREATE TABLE IF NOT EXISTS settings (
    user_id INTEGER PRIMARY KEY,
    base_currency TEXT NOT NULL,
    rates TEXT NOT NULL DEFAULT '{}',
    rates_at INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS coins (
    user_id INTEGER NOT NULL,
    id TEXT NOT NULL,
    data TEXT NOT NULL,
    pos INTEGER NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, id)
  );
  CREATE TABLE IF NOT EXISTS txs (
    user_id INTEGER NOT NULL,
    id TEXT NOT NULL,
    data TEXT NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, id)
  );
  -- Журнал всех изменений: только дописывается, из него можно восстановить любое состояние
  CREATE TABLE IF NOT EXISTS ops (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    op_id TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL,
    at INTEGER NOT NULL,
    kind TEXT NOT NULL,
    payload TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS ops_user ON ops (user_id, seq);
`

export class BadRequest extends Error {}

const isId = (x: unknown): x is string => typeof x === 'string' && x.length > 0 && x.length <= 64
const isObj = (x: unknown): x is Json => !!x && typeof x === 'object' && !Array.isArray(x)

function validate(c: unknown): Change {
  if (!isObj(c)) throw new BadRequest('change must be an object')
  switch (c.t) {
    case 'putCoin':
      if (isObj(c.coin) && isId(c.coin.id)) return c as Change
      break
    case 'putTx':
      if (isObj(c.tx) && isId(c.tx.id)) return c as Change
      break
    case 'delCoin':
    case 'delTx':
      if (isId(c.id)) return c as Change
      break
    case 'order':
      if (Array.isArray(c.ids) && c.ids.every(isId)) return c as Change
      break
    case 'base':
      if (typeof c.currency === 'string' && /^[A-Z]{3}$/.test(c.currency)) return c as Change
      break
  }
  throw new BadRequest(`bad change: ${JSON.stringify(c).slice(0, 200)}`)
}

export class Store {
  db: DatabaseSync

  constructor(path: string) {
    this.db = new DatabaseSync(path)
    this.db.exec(SCHEMA)
  }

  private tx<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const out = fn()
      this.db.exec('COMMIT')
      return out
    } catch (e) {
      this.db.exec('ROLLBACK')
      throw e
    }
  }

  hasUser(userId: number): boolean {
    return !!this.db.prepare('SELECT 1 FROM settings WHERE user_id = ?').get(userId)
  }

  snapshot(userId: number): Snapshot | null {
    const s = this.db.prepare('SELECT base_currency, rates, rates_at FROM settings WHERE user_id = ?').get(userId) as
      | { base_currency: string; rates: string; rates_at: number }
      | undefined
    if (!s) return null
    const rows = (sql: string) => (this.db.prepare(sql).all(userId) as { data: string }[]).map((r) => JSON.parse(r.data) as Json)
    return {
      baseCurrency: s.base_currency,
      rates: JSON.parse(s.rates),
      ratesAt: s.rates_at,
      coins: rows('SELECT data FROM coins WHERE user_id = ? AND deleted = 0 ORDER BY pos, id'),
      txs: rows('SELECT data FROM txs WHERE user_id = ? AND deleted = 0 ORDER BY rowid'),
    }
  }

  /** Первичная заливка (переезд из CloudStorage). Только если у пользователя ещё ничего нет */
  import(userId: number, opId: string, state: { baseCurrency: unknown; coins: unknown; txs: unknown }): boolean {
    if (typeof state.baseCurrency !== 'string' || !Array.isArray(state.coins) || !Array.isArray(state.txs))
      throw new BadRequest('bad state')
    const changes = [
      ...state.coins.map((coin) => validate({ t: 'putCoin', coin })),
      ...state.txs.map((tx) => validate({ t: 'putTx', tx })),
    ]
    const base = validate({ t: 'base', currency: state.baseCurrency })
    return this.tx(() => {
      if (this.hasUser(userId)) return false
      this.db.prepare('INSERT INTO settings (user_id, base_currency, created_at) VALUES (?, ?, ?)').run(userId, (base as { currency: string }).currency, Date.now())
      this.applyChanges(userId, changes)
      this.log(userId, opId, 'import', state)
      return true
    })
  }

  /** Применяет пачку изменений. Повтор той же пачки (тот же opId) ничего не делает */
  apply(userId: number, batch: Batch): void {
    if (!isId(batch.opId) || typeof batch.kind !== 'string' || !Array.isArray(batch.changes))
      throw new BadRequest('bad batch')
    const changes = batch.changes.map(validate)
    this.tx(() => {
      if (this.db.prepare('SELECT 1 FROM ops WHERE op_id = ?').get(batch.opId)) return
      if (!this.hasUser(userId)) throw new BadRequest('import first')
      this.applyChanges(userId, changes)
      this.log(userId, batch.opId, batch.kind, changes)
    })
  }

  setRates(userId: number, rates: unknown, ratesAt: unknown): void {
    if (!isObj(rates) || !Object.values(rates).every((v) => typeof v === 'number' && v > 0) || typeof ratesAt !== 'number')
      throw new BadRequest('bad rates')
    this.db
      .prepare('UPDATE settings SET rates = json_patch(rates, ?), rates_at = ? WHERE user_id = ?')
      .run(JSON.stringify(rates), ratesAt, userId)
  }

  private log(userId: number, opId: string, kind: string, payload: unknown) {
    this.db
      .prepare('INSERT INTO ops (op_id, user_id, at, kind, payload) VALUES (?, ?, ?, ?, ?)')
      .run(opId, userId, Date.now(), kind.slice(0, 32), JSON.stringify(payload))
  }

  private applyChanges(userId: number, changes: Change[]) {
    const now = Date.now()
    const putCoin = this.db.prepare(`
      INSERT INTO coins (user_id, id, data, pos, updated_at)
      VALUES (?, ?, ?, (SELECT COALESCE(MAX(pos), -1) + 1 FROM coins WHERE user_id = ?), ?)
      ON CONFLICT (user_id, id) DO UPDATE SET data = excluded.data, deleted = 0, updated_at = excluded.updated_at`)
    const putTx = this.db.prepare(`
      INSERT INTO txs (user_id, id, data, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT (user_id, id) DO UPDATE SET data = excluded.data, deleted = 0, updated_at = excluded.updated_at`)
    const delCoin = this.db.prepare('UPDATE coins SET deleted = 1, updated_at = ? WHERE user_id = ? AND id = ?')
    const delTx = this.db.prepare('UPDATE txs SET deleted = 1, updated_at = ? WHERE user_id = ? AND id = ?')
    const setPos = this.db.prepare('UPDATE coins SET pos = ? WHERE user_id = ? AND id = ?')
    const setBase = this.db.prepare("UPDATE settings SET base_currency = ?, rates = '{}', rates_at = 0 WHERE user_id = ?")

    for (const c of changes) {
      switch (c.t) {
        case 'putCoin':
          putCoin.run(userId, c.coin.id, JSON.stringify(c.coin), userId, now)
          break
        case 'putTx':
          putTx.run(userId, c.tx.id, JSON.stringify(c.tx), now)
          break
        case 'delCoin':
          delCoin.run(now, userId, c.id)
          break
        case 'delTx':
          delTx.run(now, userId, c.id)
          break
        case 'order':
          c.ids.forEach((id, i) => setPos.run(i, userId, id))
          break
        case 'base':
          setBase.run(c.currency, userId)
          break
      }
    }
  }

  /** Ежедневная копия БД; хранится `keep` последних */
  backup(dir: string, keep = 30, now = new Date()): string | null {
    mkdirSync(dir, { recursive: true })
    const file = join(dir, `coinly-${now.toISOString().slice(0, 10)}.db`)
    if (existsSync(file)) return null
    this.db.prepare('VACUUM INTO ?').run(file)
    const old = readdirSync(dir)
      .filter((f) => /^coinly-\d{4}-\d{2}-\d{2}\.db$/.test(f))
      .sort()
      .slice(0, -keep)
    for (const f of old) rmSync(join(dir, f))
    return file
  }
}
