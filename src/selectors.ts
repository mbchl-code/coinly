import type { Coin, State, Tx, TxKind } from './types'
import { monthOf } from './utils/date'

export type CoinMap = Map<string, Coin>

export const coinMap = (s: State): CoinMap => new Map(s.coins.map((c) => [c.id, c]))

/** Валюта монеты: у счетов и долгов своя, у доходов/расходов нет (базовая) */
export const coinCurrency = (c: Coin | undefined, base: string) =>
  c && (c.kind === 'account' || c.kind === 'debt') ? (c.currency ?? base) : null

/** Можно ли перетащить деньги из a в b */
export function canFlow(a: Coin, b: Coin) {
  if (a.id === b.id || a.closed || b.closed) return false
  if (a.kind === 'income') return b.kind === 'account'
  if (a.kind === 'account') return b.kind === 'account' || b.kind === 'expense' || b.kind === 'debt'
  if (a.kind === 'debt') return b.kind === 'account'
  return false
}

export function txKind(map: CoinMap, tx: Tx): TxKind {
  const from = map.get(tx.from)
  const to = map.get(tx.to)
  if (from?.kind === 'income') return 'income'
  if (to?.kind === 'expense') return 'expense'
  if (from?.kind === 'debt' || to?.kind === 'debt') return 'debt'
  return 'transfer'
}

/** Валюта и сумма операции «со стороны» from/to */
export function txSide(map: CoinMap, base: string, tx: Tx, side: 'from' | 'to') {
  const fromCur = coinCurrency(map.get(tx.from), base)
  const toCur = coinCurrency(map.get(tx.to), base)
  if (side === 'from') return { amount: tx.amount, currency: fromCur ?? toCur ?? base }
  return { amount: tx.amountTo ?? tx.amount, currency: toCur ?? fromCur ?? base }
}

export function toBase(s: State, amount: number, currency: string) {
  if (currency === s.baseCurrency) return amount
  return amount * (s.rates[currency] ?? 1)
}

export function convert(s: State, amount: number, from: string, to: string) {
  if (from === to) return amount
  const inBase = toBase(s, amount, from)
  return to === s.baseCurrency ? inBase : inBase / (s.rates[to] ?? 1)
}

/** Балансы счетов и долгов в их валютах. Для долга — сколько осталось (всегда «положительно = активный») */
export function balances(s: State) {
  const map = coinMap(s)
  const res = new Map<string, number>()
  for (const c of s.coins) if (c.kind === 'account' || c.kind === 'debt') res.set(c.id, c.initial ?? 0)
  for (const tx of s.txs) {
    const from = map.get(tx.from)
    const to = map.get(tx.to)
    if (from && res.has(from.id)) {
      const sign = from.kind === 'debt' && from.direction === 'borrowed' ? 1 : -1
      res.set(from.id, res.get(from.id)! + sign * txSide(map, s.baseCurrency, tx, 'from').amount)
    }
    if (to && res.has(to.id)) {
      const sign = to.kind === 'debt' && to.direction === 'borrowed' ? -1 : 1
      res.set(to.id, res.get(to.id)! + sign * txSide(map, s.baseCurrency, tx, 'to').amount)
    }
  }
  return res
}

/** Обороты по доходам/категориям за месяц в базовой валюте; подкатегории учитываются и в родителе */
export function monthTotals(s: State, month: string) {
  const map = coinMap(s)
  const res = new Map<string, number>()
  const add = (c: Coin | undefined, v: number) => {
    if (!c) return
    res.set(c.id, (res.get(c.id) ?? 0) + v)
    if (c.parentId) res.set(c.parentId, (res.get(c.parentId) ?? 0) + v)
  }
  let income = 0
  let expense = 0
  for (const tx of s.txs) {
    if (monthOf(tx.date) !== month) continue
    const kind = txKind(map, tx)
    if (kind === 'income') {
      const { amount, currency } = txSide(map, s.baseCurrency, tx, 'to')
      const v = toBase(s, amount, currency)
      income += v
      add(map.get(tx.from), v)
    } else if (kind === 'expense') {
      const { amount, currency } = txSide(map, s.baseCurrency, tx, 'from')
      const v = toBase(s, amount, currency)
      expense += v
      add(map.get(tx.to), v)
    }
  }
  return { byCoin: res, income, expense }
}

export function netWorth(s: State, bal: Map<string, number>) {
  return s.coins
    .filter((c) => c.kind === 'account')
    .reduce((sum, c) => sum + toBase(s, bal.get(c.id) ?? 0, c.currency ?? s.baseCurrency), 0)
}

export const rootsOf = (s: State, kind: Coin['kind']) => s.coins.filter((c) => c.kind === kind && !c.parentId)
export const childrenOf = (s: State, id: string) => s.coins.filter((c) => c.parentId === id)
/** Валюты, которые реально используются (для курсов) */
export const usedCurrencies = (s: State) =>
  [...new Set(s.coins.map((c) => c.currency).filter((c): c is string => !!c && c !== s.baseCurrency))]
