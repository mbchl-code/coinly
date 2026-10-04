import { useMemo, useState } from 'react'
import { CoinDisc } from '../components/Coin'
import { Icon } from '../components/Icon'
import { balances, toBase } from '../selectors'
import { useStore } from '../store'
import type { Coin } from '../types'
import { useUI } from '../ui'
import { money } from '../utils/format'

export function Debts() {
  const { state } = useStore()
  const ui = useUI()
  const bal = useMemo(() => balances(state), [state])
  const [showClosed, setShowClosed] = useState(false)
  const base = state.baseCurrency
  const debts = state.coins.filter((c) => c.kind === 'debt')
  const firstAccount = state.coins.find((c) => c.kind === 'account')

  const total = (dir: Coin['direction']) =>
    debts
      .filter((d) => d.direction === dir && !d.closed)
      .reduce((s, d) => s + toBase(state, bal.get(d.id) ?? 0, d.currency ?? base), 0)

  const group = (dir: 'lent' | 'borrowed', title: string) => {
    const list = debts.filter((d) => d.direction === dir && !d.closed)
    return (
      <section className="list-group">
        <div className="list-caption">
          <span>{title}</span>
          <span>{money(total(dir), base)}</span>
        </div>
        {list.length ? (
          <div className="card list">
            {list.map((d) => {
              const left = bal.get(d.id) ?? 0
              return (
                <div key={d.id} className="row debt-row">
                  <button type="button" className="row-tap" onClick={() => ui.open({ type: 'coin', id: d.id, kind: 'debt' })}>
                    <CoinDisc coin={d} size={40} />
                    <span className="row-main">
                      <span className="row-title">{d.name}</span>
                      <span className="row-sub">{left <= 0 ? 'Погашен' : dir === 'lent' ? 'должен вам' : 'вы должны'}</span>
                    </span>
                    <span className={`row-amount kind-${dir === 'lent' ? 'income' : 'expense'}`}>{money(left, d.currency ?? base)}</span>
                  </button>
                  <div className="debt-actions">
                    <button type="button" className="btn-tonal"
                      onClick={() => ui.open(dir === 'lent' ? { type: 'tx', from: firstAccount?.id, to: d.id } : { type: 'tx', from: d.id, to: firstAccount?.id })}>
                      {dir === 'lent' ? 'Дать ещё' : 'Занять ещё'}
                    </button>
                    <button type="button" className="btn-tonal"
                      onClick={() => ui.open(dir === 'lent' ? { type: 'tx', from: d.id, to: firstAccount?.id } : { type: 'tx', from: firstAccount?.id, to: d.id })}>
                      {dir === 'lent' ? 'Мне вернули' : 'Вернуть'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="empty small">Пусто</div>
        )}
      </section>
    )
  }

  const closed = debts.filter((d) => d.closed)

  return (
    <div className="page">
      <header className="page-head">
        <h1>Долги</h1>
        <button type="button" className="btn-tonal with-icon" onClick={() => ui.open({ type: 'coin', kind: 'debt' })}>
          <Icon name="plus" size={18} /> Новый долг
        </button>
      </header>
      {debts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🤝</div>
          <b>Долгов пока нет</b>
          <p>Записывайте, кому вы одолжили и у кого заняли. Coinly будет помнить остаток, а возвраты попадут на нужный счёт.</p>
        </div>
      ) : (
        <>
          {group('lent', 'Мне должны')}
          {group('borrowed', 'Я должен')}
        </>
      )}
      {closed.length > 0 && (
        <section className="list-group">
          <button type="button" className="list-caption link" onClick={() => setShowClosed(!showClosed)}>
            Закрытые ({closed.length}) <Icon name={showClosed ? 'up' : 'down'} size={14} stroke={2.4} />
          </button>
          {showClosed && (
            <div className="card list">
              {closed.map((d) => (
                <button key={d.id} type="button" className="row" onClick={() => ui.open({ type: 'coin', id: d.id, kind: 'debt' })}>
                  <CoinDisc coin={d} size={40} />
                  <span className="row-main"><span className="row-title">{d.name}</span></span>
                  <span className="row-amount muted">{money(bal.get(d.id) ?? 0, d.currency ?? base)}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
