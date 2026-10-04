import { useMemo, useState } from 'react'
import { Donut } from '../components/Donut'
import { Icon } from '../components/Icon'
import { MonthBar } from '../components/MonthBar'
import { childrenOf, monthTotals, rootsOf } from '../selectors'
import { useStore } from '../store'
import { haptic } from '../telegram'
import type { Coin } from '../types'
import { useUI } from '../ui'
import { money } from '../utils/format'

export function Reports() {
  const { state } = useStore()
  const ui = useUI()
  const [mode, setMode] = useState<'expense' | 'income'>('expense')
  const [open, setOpen] = useState<string | null>(null)
  const base = state.baseCurrency
  const totals = useMemo(() => monthTotals(state, ui.month), [state, ui.month])
  const value = (c: Coin) => totals.byCoin.get(c.id) ?? 0

  const items = rootsOf(state, mode)
    .map((c) => ({ coin: c, value: value(c) }))
    .filter((i) => i.value > 0)
    .sort((a, b) => b.value - a.value)
  const sum = mode === 'expense' ? totals.expense : totals.income
  const diff = totals.income - totals.expense

  return (
    <div className="page">
      <header className="page-head">
        <h1>Отчёты</h1>
        <MonthBar />
      </header>

      <div className="card summary-grid">
        <div>
          <span className="muted">Доходы</span>
          <b className="kind-income">{money(totals.income, base)}</b>
        </div>
        <div>
          <span className="muted">Расходы</span>
          <b className="kind-expense">{money(totals.expense, base)}</b>
        </div>
        <div>
          <span className="muted">Итог месяца</span>
          <b className={diff < 0 ? 'neg' : ''}>{diff > 0 ? '+' : ''}{money(diff, base)}</b>
        </div>
      </div>

      <div className="segmented" role="radiogroup">
        {(['expense', 'income'] as const).map((m) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m}
            onClick={() => (haptic.select(), setMode(m))}>
            {m === 'expense' ? 'Расходы' : 'Доходы'}
          </button>
        ))}
      </div>

      <div className="card chart-card">
        <Donut items={items.map((i) => ({ id: i.coin.id, value: i.value, color: i.coin.color }))}>
          <span className="muted">{mode === 'expense' ? 'Потрачено' : 'Получено'}</span>
          <b>{money(sum, base)}</b>
        </Donut>
        {!items.length && <div className="empty small">Нет данных за этот месяц</div>}
      </div>

      {items.length > 0 && (
        <div className="card list">
          {items.map(({ coin, value: v }) => {
            const kids = childrenOf(state, coin.id).filter((k) => value(k) > 0)
            const pct = sum ? (v / sum) * 100 : 0
            const expanded = open === coin.id
            return (
              <div key={coin.id} className="report-item">
                <button type="button" className="row" aria-expanded={kids.length ? expanded : undefined}
                  onClick={() => kids.length && (haptic.select(), setOpen(expanded ? null : coin.id))}>
                  <span className="dot-icon" style={{ background: coin.color }}>{coin.icon}</span>
                  <span className="row-main">
                    <span className="row-title">
                      {coin.name}
                      {kids.length > 0 && <Icon name={expanded ? 'up' : 'down'} size={14} stroke={2.4} />}
                    </span>
                    <span className="bar">
                      <span style={{ width: `${coin.budget ? Math.min((v / coin.budget) * 100, 100) : pct}%`, background: coin.budget && v > coin.budget ? 'var(--danger)' : coin.color }} />
                    </span>
                    {coin.budget ? (
                      <span className={`row-sub${v > coin.budget ? ' neg' : ''}`}>
                        {v > coin.budget ? 'Перерасход ' + money(v - coin.budget, base) : 'Осталось ' + money(coin.budget - v, base)} из {money(coin.budget, base)}
                      </span>
                    ) : null}
                  </span>
                  <span className="row-amount">
                    {money(v, base)}
                    <small>{pct.toFixed(pct < 10 ? 1 : 0)}%</small>
                  </span>
                </button>
                {expanded && (
                  <div className="sub-list">
                    {kids.map((k) => (
                      <div key={k.id} className="sub-row">
                        <span>{k.icon} {k.name}</span>
                        <span>{money(value(k), base)}</span>
                      </div>
                    ))}
                    {v - kids.reduce((s, k) => s + value(k), 0) > 0.009 && (
                      <div className="sub-row muted">
                        <span>Без подкатегории</span>
                        <span>{money(v - kids.reduce((s, k) => s + value(k), 0), base)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
