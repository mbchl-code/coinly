import { useState } from 'react'
import { Icon } from '../components/Icon'
import { CURRENCIES } from '../defaults'
import { fetchRates } from '../rates'
import { coinMap, txKind, txSide, usedCurrencies } from '../selectors'
import { storageLabel } from '../storage'
import { useStore } from '../store'
import { alertDialog, confirmDialog, haptic } from '../telegram'
import type { Coin, CoinKind } from '../types'
import { useUI } from '../ui'
import { parseNumber } from '../utils/calc'

const KIND_TYPES: Record<string, string> = { income: 'Доход', expense: 'Расход', transfer: 'Перевод', debt: 'Долг' }

export function Settings() {
  const { state, dispatch } = useStore()
  const ui = useUI()
  const [loading, setLoading] = useState(false)
  const base = state.baseCurrency
  const foreign = usedCurrencies(state)

  const refreshRates = async () => {
    setLoading(true)
    try {
      dispatch({ type: 'setRates', rates: await fetchRates(base, foreign), at: Date.now() })
      haptic.success()
    } catch {
      haptic.error()
      await alertDialog('Не удалось загрузить курсы. Проверьте соединение или задайте курс вручную.')
    } finally {
      setLoading(false)
    }
  }

  const exportCsv = async () => {
    const map = coinMap(state)
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
    const name = (id: string) => map.get(id)?.name ?? '?'
    const rows = [...state.txs]
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .map((t) => {
        const s = txSide(map, base, t, 'from')
        return [t.date, KIND_TYPES[txKind(map, t)], esc(name(t.from)), esc(name(t.to)), String(t.amount).replace('.', ','), s.currency, esc(t.note ?? '')].join(';')
      })
    const csv = ['Дата;Тип;Откуда;Куда;Сумма;Валюта;Комментарий', ...rows].join('\n')
    try {
      await navigator.clipboard.writeText(csv)
      haptic.success()
      await alertDialog(`Скопировано операций: ${rows.length}. Вставьте в Excel или Google Таблицы.`)
    } catch {
      await alertDialog('Не удалось скопировать в буфер обмена')
    }
  }

  const reset = async () => {
    if (!(await confirmDialog('Удалить все счета, категории и операции? Это действие нельзя отменить.'))) return
    dispatch({ type: 'reset' })
    haptic.success()
  }

  const coinList = (kind: CoinKind, title: string, addLabel: string) => {
    const roots = state.coins.filter((c) => c.kind === kind && !c.parentId)
    const row = (c: Coin, list: Coin[], nested = false) => {
      const i = list.indexOf(c)
      return (
        <div key={c.id} className={`row manage-row${nested ? ' nested' : ''}`}>
          <button type="button" className="row-tap" onClick={() => ui.open({ type: 'coin', id: c.id, kind })}>
            <span className="dot-icon" style={{ background: c.color }}>{c.icon}</span>
            <span className="row-main">
              <span className="row-title">{c.name}</span>
            </span>
          </button>
          <button type="button" className="icon-btn" disabled={i === 0} aria-label="Выше"
            onClick={() => (haptic.select(), dispatch({ type: 'moveCoin', id: c.id, dir: -1 }))}>
            <Icon name="up" size={18} />
          </button>
          <button type="button" className="icon-btn" disabled={i === list.length - 1} aria-label="Ниже"
            onClick={() => (haptic.select(), dispatch({ type: 'moveCoin', id: c.id, dir: 1 }))}>
            <Icon name="down" size={18} />
          </button>
        </div>
      )
    }
    return (
      <section className="list-group">
        <div className="list-caption">{title}</div>
        <div className="card list">
          {roots.map((c) => {
            const kids = state.coins.filter((k) => k.parentId === c.id)
            return (
              <div key={c.id}>
                {row(c, roots)}
                {kids.map((k) => row(k, kids, true))}
              </div>
            )
          })}
          <button type="button" className="row add-row" onClick={() => ui.open({ type: 'coin', kind })}>
            <Icon name="plus" size={20} /> {addLabel}
          </button>
        </div>
      </section>
    )
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>Настройки</h1>
      </header>

      <section className="list-group">
        <div className="list-caption">Валюта</div>
        <div className="card list">
          <label className="form-row">
            <span>Основная валюта</span>
            <select value={base} onChange={async (e) => {
              const v = e.target.value
              if (await confirmDialog('Сменить основную валюту? Бюджеты и итоги будут показаны в новой валюте без пересчёта.')) {
                dispatch({ type: 'setBaseCurrency', currency: v })
              }
            }}>
              {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
            </select>
          </label>
          {foreign.map((code) => (
            <label key={code} className="form-row">
              <span>1 {code} =</span>
              <input inputMode="decimal" defaultValue={state.rates[code] ? +state.rates[code].toFixed(4) : ''}
                key={`${code}${state.rates[code]}`} placeholder="курс"
                onBlur={(e) => {
                  const v = parseNumber(e.target.value)
                  if (v && v > 0) dispatch({ type: 'setRates', rates: { [code]: v } })
                }} />
              <span className="hint">{base}</span>
            </label>
          ))}
          {foreign.length > 0 && (
            <button type="button" className="row add-row" onClick={refreshRates} disabled={loading}>
              {loading ? 'Загрузка…' : 'Обновить курсы'}
              {state.ratesAt > 0 && <span className="muted"> · {new Date(state.ratesAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}
            </button>
          )}
        </div>
      </section>

      {coinList('account', 'Счета', 'Новый счёт')}
      {coinList('income', 'Источники дохода', 'Новый источник')}
      {coinList('expense', 'Категории расходов', 'Новая категория')}

      <section className="list-group">
        <div className="list-caption">Данные</div>
        <div className="card list">
          <div className="form-row">
            <span>Хранение</span>
            <span className="muted">{storageLabel}</span>
          </div>
          <button type="button" className="row add-row" onClick={exportCsv}>Скопировать операции в CSV</button>
          <button type="button" className="row add-row danger" onClick={reset}>Сбросить все данные</button>
        </div>
      </section>
      <p className="footnote">Coinly · {state.txs.length} операций</p>
    </div>
  )
}
