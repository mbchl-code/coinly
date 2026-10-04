import { useMemo, useState } from 'react'
import { AddCoin, Coin, type CoinState } from '../components/Coin'
import { Icon } from '../components/Icon'
import { MonthBar } from '../components/MonthBar'
import { useCoinDrag } from '../components/useCoinDrag'
import { balances, canFlow, coinMap, monthTotals, netWorth, rootsOf } from '../selectors'
import { useStore } from '../store'
import type { Coin as CoinT, CoinKind } from '../types'
import { useUI } from '../ui'
import { money, moneyShort } from '../utils/format'

const HINT_KEY = 'coinly:hint-dismissed'
const hintDismissed = () => {
  try {
    return localStorage.getItem(HINT_KEY) === '1'
  } catch {
    return false
  }
}

export function Home() {
  const { state } = useStore()
  const ui = useUI()
  const base = state.baseCurrency
  const map = useMemo(() => coinMap(state), [state])
  const bal = useMemo(() => balances(state), [state])
  const totals = useMemo(() => monthTotals(state, ui.month), [state, ui.month])
  const [hint, setHint] = useState(() => !hintDismissed())

  const drag = useCoinDrag({
    map,
    onTap: (coin) => {
      if (coin.kind === 'account') ui.open({ type: 'coin', id: coin.id, kind: 'account' })
      else if (coin.kind === 'income') ui.open({ type: 'tx', from: coin.id })
      else ui.open({ type: 'tx', to: coin.id })
    },
    onDrop: (from, to) => ui.open({ type: 'tx', from: from.id, to: to.id }),
  })

  const stateOf = (c: CoinT): CoinState => {
    if (!drag.source) return null
    if (drag.source.id === c.id) return 'source'
    if (drag.overId === c.id) return 'over'
    return canFlow(drag.source, c) ? 'target' : 'dim'
  }

  const incomes = rootsOf(state, 'income')
  const accounts = rootsOf(state, 'account')
  const expenses = rootsOf(state, 'expense')
  const total = netWorth(state, bal)
  const budgetTotal = expenses.reduce((s, c) => s + (c.budget ?? 0), 0)

  const add = (kind: CoinKind) => ui.open({ type: 'coin', kind })

  const render = (c: CoinT) => {
    const isAccount = c.kind === 'account'
    const value = isAccount ? (bal.get(c.id) ?? 0) : (totals.byCoin.get(c.id) ?? 0)
    const cur = isAccount ? (c.currency ?? base) : base
    return (
      <Coin
        key={c.id}
        coin={c}
        amount={moneyShort(value, cur)}
        negative={isAccount && value < 0}
        progress={c.budget ? value / c.budget : null}
        state={stateOf(c)}
        onPointerDown={drag.bind(c)}
        onActivate={() => ui.open(isAccount ? { type: 'coin', id: c.id, kind: 'account' } : { type: 'tx', [c.kind === 'income' ? 'from' : 'to']: c.id })}
      />
    )
  }

  return (
    <div className={`home${drag.source ? ' dragging' : ''}`}>
      <header className="hero">
        <MonthBar />
        <div className="hero-label">Всего на счетах</div>
        <div className={`hero-value${total < 0 ? ' neg' : ''}`}>{money(total, base)}</div>
        <div className="hero-stats">
          <span className="stat income">+{money(totals.income, base)}</span>
          <span className="stat expense">−{money(totals.expense, base)}</span>
        </div>
      </header>

      {hint && (
        <div className="hint-card" role="note">
          <div>
            <b>Удерживайте монету и перетащите</b>
            <br />
            доход → на счёт, счёт → на категорию или другой счёт. Нажмите на категорию, чтобы быстро записать расход.
          </div>
          <button type="button" className="icon-btn" aria-label="Скрыть подсказку"
            onClick={() => {
              setHint(false)
              try {
                localStorage.setItem(HINT_KEY, '1')
              } catch { /* ignore */ }
            }}>
            <Icon name="close" size={18} />
          </button>
        </div>
      )}

      <section className="coin-section">
        <div className="section-head">
          <h3>Доходы</h3>
          <span>{money(totals.income, base)}</span>
        </div>
        <div className="coin-grid">
          {incomes.map(render)}
          <AddCoin label="Добавить" onClick={() => add('income')} />
        </div>
      </section>

      <section className="coin-section">
        <div className="section-head">
          <h3>Счета</h3>
          <span>{money(total, base)}</span>
        </div>
        <div className="coin-grid">
          {accounts.map(render)}
          <AddCoin label="Добавить" onClick={() => add('account')} />
        </div>
      </section>

      <section className="coin-section">
        <div className="section-head">
          <h3>Расходы</h3>
          <span>
            {money(totals.expense, base)}
            {budgetTotal > 0 && <span className="muted"> из {money(budgetTotal, base)}</span>}
          </span>
        </div>
        <div className="coin-grid">
          {expenses.map(render)}
          <AddCoin label="Добавить" onClick={() => add('expense')} />
        </div>
      </section>

      {drag.layer}
    </div>
  )
}
