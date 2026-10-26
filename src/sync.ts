import type { Coin, State, Tx } from './types'

/** Изменение одной сущности — то же, что понимает сервер (server/src/db.ts) */
export type Change =
  | { t: 'putCoin'; coin: Coin }
  | { t: 'delCoin'; id: string }
  | { t: 'order'; ids: string[] }
  | { t: 'putTx'; tx: Tx }
  | { t: 'delTx'; id: string }
  | { t: 'base'; currency: string }

export interface Batch {
  opId: string
  kind: string
  changes: Change[]
}

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b)

/** Что поменялось между двумя состояниями, по сущностям. Курсы валют сюда не входят */
export function diff(prev: State, next: State): Change[] {
  const out: Change[] = []
  if (prev.baseCurrency !== next.baseCurrency) out.push({ t: 'base', currency: next.baseCurrency })

  const prevCoins = new Map(prev.coins.map((c) => [c.id, c]))
  const nextCoinIds = new Set(next.coins.map((c) => c.id))
  for (const c of next.coins) if (!same(prevCoins.get(c.id), c)) out.push({ t: 'putCoin', coin: c })
  for (const c of prev.coins) if (!nextCoinIds.has(c.id)) out.push({ t: 'delCoin', id: c.id })
  // Новые монеты сервер ставит в конец; порядок шлём, только если итог отличается от этого
  const ids = next.coins.map((c) => c.id)
  const expected = [...prev.coins.filter((c) => nextCoinIds.has(c.id)), ...next.coins.filter((c) => !prevCoins.has(c.id))]
  if (ids.join() !== expected.map((c) => c.id).join()) out.push({ t: 'order', ids })

  const prevTxs = new Map(prev.txs.map((t) => [t.id, t]))
  const nextTxIds = new Set(next.txs.map((t) => t.id))
  for (const t of next.txs) if (!same(prevTxs.get(t.id), t)) out.push({ t: 'putTx', tx: t })
  for (const t of prev.txs) if (!nextTxIds.has(t.id)) out.push({ t: 'delTx', id: t.id })
  return out
}

/** Накладывает изменения на состояние так же, как это делает сервер */
export function applyChanges(s: State, changes: Change[]): State {
  let { coins, txs, baseCurrency, rates, ratesAt } = s
  for (const c of changes) {
    switch (c.t) {
      case 'putCoin':
        coins = coins.some((x) => x.id === c.coin.id) ? coins.map((x) => (x.id === c.coin.id ? c.coin : x)) : [...coins, c.coin]
        break
      case 'delCoin':
        coins = coins.filter((x) => x.id !== c.id)
        break
      case 'order': {
        const pos = new Map(c.ids.map((id, i) => [id, i]))
        coins = [...coins].sort((a, b) => (pos.get(a.id) ?? Infinity) - (pos.get(b.id) ?? Infinity))
        break
      }
      case 'putTx':
        txs = txs.some((x) => x.id === c.tx.id) ? txs.map((x) => (x.id === c.tx.id ? c.tx : x)) : [...txs, c.tx]
        break
      case 'delTx':
        txs = txs.filter((x) => x.id !== c.id)
        break
      case 'base':
        baseCurrency = c.currency
        rates = {}
        ratesAt = 0
        break
    }
  }
  return { ...s, coins, txs, baseCurrency, rates, ratesAt }
}

/** Объединение двух копий по id: ничего не теряется, при конфликте побеждает `primary` */
export function mergeStates(primary: State, other: State): State {
  const byId = <T extends { id: string }>(a: T[], b: T[]) => {
    const ids = new Set(a.map((x) => x.id))
    return [...a, ...b.filter((x) => !ids.has(x.id))]
  }
  return { ...primary, coins: byId(primary.coins, other.coins), txs: byId(primary.txs, other.txs) }
}
