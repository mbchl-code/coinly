import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { verifyInitData } from '../src/auth.ts'
import { BadRequest, Store } from '../src/db.ts'

const TOKEN = '123:test'

function sign(fields: Record<string, string>, token = TOKEN) {
  const check = Object.entries(fields)
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n')
  const secret = createHmac('sha256', 'WebAppData').update(token).digest()
  const hash = createHmac('sha256', secret).update(check).digest('hex')
  return new URLSearchParams({ ...fields, hash }).toString()
}

const now = Math.floor(Date.now() / 1000)
const user = JSON.stringify({ id: 42, first_name: 'Тест' })

test('initData: valid signature yields user id', () => {
  assert.equal(verifyInitData(sign({ auth_date: String(now), user, query_id: 'q' }), TOKEN), 42)
})

test('initData: forged, foreign-bot and expired data are rejected', () => {
  const good = sign({ auth_date: String(now), user })
  assert.equal(verifyInitData(good.replace('42', '43'), TOKEN), null)
  assert.equal(verifyInitData(sign({ auth_date: String(now), user }, '999:other'), TOKEN), null)
  assert.equal(verifyInitData(sign({ auth_date: String(now - 8 * 86400), user }), TOKEN), null)
  assert.equal(verifyInitData('', TOKEN), null)
})

const tmp = () => new Store(join(mkdtempSync(join(tmpdir(), 'coinly-')), 'db.sqlite'))
const coin = (id: string, name = id) => ({ id, kind: 'expense', name, icon: '', color: '' })
const tx = (id: string, from = 'a', to = 'b') => ({ id, from, to, amount: 1, date: '2026-10-26', createdAt: 1 })

test('import only into an empty account', () => {
  const s = tmp()
  assert.equal(s.import(1, 'i1', { baseCurrency: 'BYN', coins: [coin('a'), coin('b')], txs: [tx('t1')] }), true)
  assert.equal(s.import(1, 'i2', { baseCurrency: 'BYN', coins: [], txs: [] }), false)
  const snap = s.snapshot(1)!
  assert.deepEqual(snap.coins.map((c) => c.id), ['a', 'b'])
  assert.equal(snap.txs.length, 1)
  assert.equal(s.snapshot(2), null)
})

test('ops are idempotent by opId', () => {
  const s = tmp()
  s.import(1, 'i', { baseCurrency: 'BYN', coins: [coin('a'), coin('b')], txs: [] })
  const batch = { opId: 'op1', kind: 'addTx', changes: [{ t: 'putTx' as const, tx: tx('t1') }] }
  s.apply(1, batch)
  s.apply(1, batch)
  assert.equal(s.snapshot(1)!.txs.length, 1)
  const ops = s.db.prepare("SELECT kind FROM ops WHERE user_id = 1 ORDER BY seq").all()
  assert.deepEqual(ops.map((o) => (o as { kind: string }).kind), ['import', 'addTx'])
})

test('deletes are soft, journal keeps everything, put restores', () => {
  const s = tmp()
  s.import(1, 'i', { baseCurrency: 'BYN', coins: [coin('a'), coin('b')], txs: [tx('t1'), tx('t2')] })
  s.apply(1, { opId: 'd', kind: 'deleteCoin', changes: [{ t: 'delCoin', id: 'a' }, { t: 'delTx', id: 't1' }, { t: 'delTx', id: 't2' }] })
  assert.deepEqual(s.snapshot(1)!.txs, [])
  assert.equal((s.db.prepare('SELECT COUNT(*) n FROM txs').get() as { n: number }).n, 2)
  s.apply(1, { opId: 'r', kind: 'addTx', changes: [{ t: 'putTx', tx: tx('t1') }] })
  assert.deepEqual(s.snapshot(1)!.txs.map((t) => t.id), ['t1'])
})

test('a stale device cannot wipe data written by another device', () => {
  const s = tmp()
  s.import(1, 'i', { baseCurrency: 'BYN', coins: [coin('a'), coin('b')], txs: [tx('t1')] })
  s.apply(1, { opId: 'phone', kind: 'addTx', changes: [{ t: 'putTx', tx: tx('t2') }] })
  // Десктоп со старым кэшем: может только добавить своё, но не перезаписать всё
  assert.equal(s.import(1, 'desk-import', { baseCurrency: 'BYN', coins: [coin('a')], txs: [tx('t1')] }), false)
  s.apply(1, { opId: 'desk', kind: 'addTx', changes: [{ t: 'putTx', tx: tx('t3') }] })
  s.setRates(1, { USD: 3.3 }, 5)
  const snap = s.snapshot(1)!
  assert.deepEqual(snap.txs.map((t) => t.id), ['t1', 't2', 't3'])
  assert.deepEqual(snap.rates, { USD: 3.3 })
})

test('order and base currency', () => {
  const s = tmp()
  s.import(1, 'i', { baseCurrency: 'BYN', coins: [coin('a'), coin('b'), coin('c')], txs: [] })
  s.setRates(1, { USD: 3 }, 1)
  s.apply(1, { opId: 'o', kind: 'moveCoin', changes: [{ t: 'order', ids: ['c', 'a', 'b'] }, { t: 'base', currency: 'USD' }] })
  const snap = s.snapshot(1)!
  assert.deepEqual(snap.coins.map((c) => c.id), ['c', 'a', 'b'])
  assert.equal(snap.baseCurrency, 'USD')
  assert.deepEqual(snap.rates, {})
})

test('invalid input is rejected without partial writes', () => {
  const s = tmp()
  s.import(1, 'i', { baseCurrency: 'BYN', coins: [coin('a')], txs: [] })
  assert.throws(() => s.apply(1, { opId: 'x', kind: 'k', changes: [{ t: 'putTx', tx: tx('ok') }, { t: 'nope' } as never] }), BadRequest)
  assert.throws(() => s.apply(2, { opId: 'y', kind: 'k', changes: [] }), BadRequest)
  assert.throws(() => s.setRates(1, { USD: -1 }, 1), BadRequest)
  assert.equal(s.snapshot(1)!.txs.length, 0)
})

test('daily backup with retention', () => {
  const s = tmp()
  s.import(1, 'i', { baseCurrency: 'BYN', coins: [coin('a')], txs: [] })
  const dir = mkdtempSync(join(tmpdir(), 'coinly-bk-'))
  for (let d = 1; d <= 3; d++) writeFileSync(join(dir, `coinly-2026-01-0${d}.db`), '')
  const file = s.backup(dir, 2, new Date('2026-10-26T10:00:00Z'))!
  assert.ok(existsSync(file))
  assert.equal(s.backup(dir, 2, new Date('2026-10-26T20:00:00Z')), null)
  assert.deepEqual(readdirSync(dir).sort(), ['coinly-2026-01-03.db', 'coinly-2026-10-26.db'])
  assert.equal(new Store(file).snapshot(1)!.coins.length, 1)
})
