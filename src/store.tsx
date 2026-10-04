import { createContext, useContext, useEffect, useReducer, useRef, type Dispatch, type ReactNode } from 'react'
import { createDefaultState } from './defaults'
import { fetchRates, RATES_TTL } from './rates'
import { usedCurrencies } from './selectors'
import { loadState, saveState } from './storage'
import type { Coin, State, Tx } from './types'

export type Action =
  | { type: 'load'; state: State }
  | { type: 'addTx'; tx: Tx }
  | { type: 'updateTx'; tx: Tx }
  | { type: 'deleteTx'; id: string }
  | { type: 'saveCoin'; coin: Coin }
  | { type: 'deleteCoin'; id: string }
  | { type: 'moveCoin'; id: string; dir: -1 | 1 }
  | { type: 'setBaseCurrency'; currency: string }
  | { type: 'setRates'; rates: Record<string, number>; at?: number }
  | { type: 'reset' }

function reduce(s: State, a: Action): State {
  switch (a.type) {
    case 'load':
      return a.state
    case 'addTx':
      return { ...s, txs: [...s.txs, a.tx] }
    case 'updateTx':
      return { ...s, txs: s.txs.map((t) => (t.id === a.tx.id ? a.tx : t)) }
    case 'deleteTx':
      return { ...s, txs: s.txs.filter((t) => t.id !== a.id) }
    case 'saveCoin': {
      const exists = s.coins.some((c) => c.id === a.coin.id)
      const coins = exists ? s.coins.map((c) => (c.id === a.coin.id ? a.coin : c)) : [...s.coins, a.coin]
      // если категория сама стала подкатегорией — её дети поднимаются в корень
      return {
        ...s,
        coins: a.coin.parentId ? coins.map((c) => (c.parentId === a.coin.id ? { ...c, parentId: undefined } : c)) : coins,
      }
    }
    case 'deleteCoin':
      return {
        ...s,
        coins: s.coins.filter((c) => c.id !== a.id).map((c) => (c.parentId === a.id ? { ...c, parentId: undefined } : c)),
        txs: s.txs.filter((t) => t.from !== a.id && t.to !== a.id),
      }
    case 'moveCoin': {
      const coin = s.coins.find((c) => c.id === a.id)
      if (!coin) return s
      const siblings = s.coins.filter((c) => c.kind === coin.kind && c.parentId === coin.parentId)
      const i = siblings.indexOf(coin)
      const other = siblings[i + a.dir]
      if (!other) return s
      const coins = [...s.coins]
      const ia = coins.indexOf(coin)
      const ib = coins.indexOf(other)
      ;[coins[ia], coins[ib]] = [coins[ib], coins[ia]]
      return { ...s, coins }
    }
    case 'setBaseCurrency':
      return { ...s, baseCurrency: a.currency, rates: {}, ratesAt: 0 }
    case 'setRates':
      return { ...s, rates: { ...s.rates, ...a.rates }, ratesAt: a.at ?? s.ratesAt }
    case 'reset':
      return createDefaultState()
  }
}

function root(s: State | null, a: Action): State | null {
  if (a.type === 'load') return a.state
  if (!s) return s
  return { ...reduce(s, a), updatedAt: Date.now() }
}

interface Store {
  state: State
  dispatch: Dispatch<Action>
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const [state, dispatch] = useReducer(root, null)
  const loaded = useRef(false)

  useEffect(() => {
    loadState().then((s) => dispatch({ type: 'load', state: s ?? createDefaultState() }))
  }, [])

  useEffect(() => {
    if (!state) return
    if (!loaded.current) {
      loaded.current = true
      return
    }
    saveState(state)
  }, [state])

  // Курсы валют: обновляем, если устарели и есть счета в других валютах
  const codes = state ? usedCurrencies(state).sort().join(',') : ''
  const missing = !!state && usedCurrencies(state).some((c) => !state.rates[c])
  useEffect(() => {
    if (!state || !codes) return
    if (!missing && Date.now() - state.ratesAt < RATES_TTL) return
    fetchRates(state.baseCurrency, codes.split(','))
      .then((rates) => dispatch({ type: 'setRates', rates, at: Date.now() }))
      .catch((e) => console.warn('Coinly: курсы не загрузились', e))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codes, state?.baseCurrency, missing])

  if (!state) return <>{fallback}</>
  return <Ctx.Provider value={{ state, dispatch }}>{children}</Ctx.Provider>
}

export function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore outside provider')
  return s
}
