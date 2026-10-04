import { useMemo, useState } from 'react'
import { CoinDisc } from '../components/Coin'
import { MonthBar } from '../components/MonthBar'
import { coinMap, txKind, txSide } from '../selectors'
import { useStore } from '../store'
import { haptic } from '../telegram'
import type { Coin, Tx, TxKind } from '../types'
import { useUI } from '../ui'
import { dayLabel, monthOf } from '../utils/date'
import { money } from '../utils/format'

const FILTERS: { id: TxKind | 'all'; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'expense', label: 'Расходы' },
  { id: 'income', label: 'Доходы' },
  { id: 'transfer', label: 'Переводы' },
  { id: 'debt', label: 'Долги' },
]

function debtLabel(debt: Coin, account: Coin, toAccount: boolean) {
  const action = debt.direction === 'lent'
    ? (toAccount ? 'Вам вернули' : 'Дали в долг')
    : (toAccount ? 'Взяли в долг' : 'Вы вернули')
  return `${action} · ${account.name}`
}

export function History() {
  const { state } = useStore()
  const ui = useUI()
  const [filter, setFilter] = useState<TxKind | 'all'>('all')
  const map = useMemo(() => coinMap(state), [state])
  const base = state.baseCurrency

  const groups = useMemo(() => {
    const txs = state.txs
      .filter((t) => monthOf(t.date) === ui.month && (filter === 'all' || txKind(map, t) === filter))
      .sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1))
    const out: { date: string; txs: Tx[] }[] = []
    for (const t of txs) {
      if (out.at(-1)?.date !== t.date) out.push({ date: t.date, txs: [] })
      out.at(-1)!.txs.push(t)
    }
    return out
  }, [state, ui.month, filter, map])

  return (
    <div className="page">
      <header className="page-head">
        <h1>Операции</h1>
        <MonthBar />
      </header>
      <div className="chips scroll" role="radiogroup" aria-label="Тип операций">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" role="radio" aria-checked={filter === f.id} className="chip"
            onClick={() => (haptic.select(), setFilter(f.id))}>
            {f.label}
          </button>
        ))}
      </div>

      {!groups.length && <div className="empty">Операций за этот месяц пока нет</div>}

      {groups.map((g) => (
        <section key={g.date} className="list-group">
          <div className="list-caption">{dayLabel(g.date)}</div>
          <div className="card list">
            {g.txs.map((t) => {
              const kind = txKind(map, t)
              const from = map.get(t.from)
              const to = map.get(t.to)
              const main = kind === 'income' || from?.kind === 'debt' ? from : to
              if (!from || !to || !main) return null
              const { amount, currency } = txSide(map, base, t, kind === 'income' ? 'to' : 'from')
              const sign = kind === 'income' ? '+' : kind === 'expense' ? '−' : ''
              const parent = main.parentId ? map.get(main.parentId) : undefined
              return (
                <button key={t.id} type="button" className="row"
                  onClick={() => ui.open({ type: 'tx', txId: t.id })}>
                  <CoinDisc coin={main} size={40} />
                  <span className="row-main">
                    <span className="row-title">{parent ? `${parent.name} · ${main.name}` : main.name}</span>
                    <span className="row-sub">
                      {kind === 'income' ? to.name
                        : kind === 'expense' ? from.name
                        : kind === 'debt' ? debtLabel(from.kind === 'debt' ? from : to, from.kind === 'debt' ? to : from, from.kind === 'debt')
                        : `${from.name} → ${to.name}`}
                      {t.note ? ` · ${t.note}` : ''}
                    </span>
                  </span>
                  <span className={`row-amount kind-${kind}`}>
                    {sign}{money(amount, currency)}
                    {t.amountTo != null && <small>{money(t.amountTo, txSide(map, base, t, 'to').currency)}</small>}
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
