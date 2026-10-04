import { useMemo, useState } from 'react'
import { COLORS, CURRENCIES, ICONS, newCoin } from '../defaults'
import { balances } from '../selectors'
import { useStore } from '../store'
import { confirmDialog, haptic } from '../telegram'
import type { Coin, CoinKind } from '../types'
import { useUI } from '../ui'
import { parseNumber, toExpr } from '../utils/calc'
import { currencySymbol } from '../utils/format'
import { CoinDisc } from './Coin'
import { Icon } from './Icon'

const TITLES: Record<CoinKind, [string, string]> = {
  income: ['Новый источник дохода', 'Источник дохода'],
  account: ['Новый счёт', 'Счёт'],
  expense: ['Новая категория', 'Категория'],
  debt: ['Новый долг', 'Долг'],
}

export function CoinSheet({ id, kind, parentId }: { id?: string; kind: CoinKind; parentId?: string }) {
  const { state, dispatch } = useStore()
  const ui = useUI()
  const existing = id ? state.coins.find((c) => c.id === id) : undefined
  const [draft, setDraft] = useState<Coin>(() => existing ?? newCoin(kind, state.baseCurrency, parentId))
  const bal = useMemo(() => balances(state), [state])
  const net = existing ? (bal.get(existing.id) ?? 0) - (existing.initial ?? 0) : 0
  const [balanceText, setBalanceText] = useState(() => toExpr(existing ? (bal.get(existing.id) ?? 0) : 0))
  const [budgetText, setBudgetText] = useState(() => toExpr(draft.budget ?? 0))
  const [error, setError] = useState(false)

  const set = (patch: Partial<Coin>) => setDraft((d) => ({ ...d, ...patch }))
  const hasMoney = draft.kind === 'account' || draft.kind === 'debt'
  const canNest = draft.kind === 'income' || draft.kind === 'expense'
  const hasChildren = !!existing && state.coins.some((c) => c.parentId === existing.id)
  const parents = state.coins.filter((c) => c.kind === draft.kind && !c.parentId && c.id !== draft.id)
  const txCount = existing ? state.txs.filter((t) => t.from === existing.id || t.to === existing.id).length : 0

  const save = () => {
    const name = draft.name.trim()
    if (!name) {
      setError(true)
      haptic.error()
      return
    }
    const coin: Coin = { ...draft, name }
    if (hasMoney) coin.initial = Math.round(((parseNumber(balanceText) ?? 0) - net) * 100) / 100
    if (canNest) {
      const b = parseNumber(budgetText)
      if (b && b > 0) coin.budget = b
      else delete coin.budget
    }
    dispatch({ type: 'saveCoin', coin })
    haptic.success()
    ui.close()
  }

  const remove = async () => {
    if (!existing) return
    const msg = txCount
      ? `Удалить «${existing.name}»? Вместе с ним удалятся операции: ${txCount}.`
      : `Удалить «${existing.name}»?`
    if (!(await confirmDialog(msg))) return
    dispatch({ type: 'deleteCoin', id: existing.id })
    haptic.success()
    ui.close()
  }

  const balanceLabel =
    draft.kind === 'account' ? 'Текущий баланс' : draft.direction === 'lent' ? 'Сколько вам должны' : 'Сколько вы должны'

  return (
    <>
      <div className="sheet-head" data-sheet-drag>
        <div className="sheet-title-row" data-sheet-drag>
          <h2 className="sheet-title">{TITLES[draft.kind][existing ? 1 : 0]}</h2>
          {existing && (
            <button type="button" className="icon-btn danger" onClick={remove} aria-label="Удалить">
              <Icon name="trash" />
            </button>
          )}
        </div>
      </div>

      <div className="sheet-body">
        <div className="editor-hero">
          <CoinDisc coin={draft} size={64} />
          <input
            className={`title-input${error ? ' invalid' : ''}`}
            placeholder={draft.kind === 'debt' ? 'Имя человека' : 'Название'}
            value={draft.name}
            maxLength={24}
            autoFocus={!existing}
            onChange={(e) => {
              setError(false)
              set({ name: e.target.value })
            }}
          />
        </div>

        {draft.kind === 'debt' && (
          <div className="segmented" role="radiogroup">
            {(['lent', 'borrowed'] as const).map((d) => (
              <button key={d} type="button" role="radio" aria-checked={draft.direction === d}
                onClick={() => (haptic.select(), set({ direction: d }))}>
                {d === 'lent' ? 'Мне должны' : 'Я должен'}
              </button>
            ))}
          </div>
        )}

        {hasMoney && (
          <div className="form-group">
            <label className="form-row">
              <span>{balanceLabel}</span>
              <input inputMode="decimal" value={balanceText} placeholder="0"
                onChange={(e) => setBalanceText(e.target.value)} />
              <span className="hint">{currencySymbol(draft.currency ?? state.baseCurrency)}</span>
            </label>
            <label className="form-row">
              <span>Валюта</span>
              <select value={draft.currency} onChange={(e) => set({ currency: e.target.value })}>
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                ))}
              </select>
            </label>
          </div>
        )}

        {canNest && (
          <div className="form-group">
            <label className="form-row">
              <span>{draft.kind === 'expense' ? 'Бюджет на месяц' : 'План на месяц'}</span>
              <input inputMode="decimal" value={budgetText} placeholder="Не задан"
                onChange={(e) => setBudgetText(e.target.value)} />
              <span className="hint">{currencySymbol(state.baseCurrency)}</span>
            </label>
            <label className="form-row">
              <span>Входит в</span>
              <select value={draft.parentId ?? ''} disabled={hasChildren}
                onChange={(e) => set({ parentId: e.target.value || undefined })}>
                <option value="">— верхний уровень —</option>
                {parents.map((p) => (
                  <option key={p.id} value={p.id}>{p.icon} {p.name}</option>
                ))}
              </select>
            </label>
          </div>
        )}

        <div className="section-label">Цвет</div>
        <div className="swatches" role="radiogroup" aria-label="Цвет">
          {COLORS.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={draft.color === c} aria-label={c}
              className="swatch" style={{ background: c }} onClick={() => (haptic.select(), set({ color: c }))} />
          ))}
        </div>

        <div className="section-label">Иконка</div>
        <div className="icon-grid" role="radiogroup" aria-label="Иконка">
          {ICONS.map((i) => (
            <button key={i} type="button" role="radio" aria-checked={draft.icon === i} className="icon-cell"
              onClick={() => (haptic.select(), set({ icon: i }))}>
              {i}
            </button>
          ))}
        </div>

        {canNest && existing && !existing.parentId && (
          <button type="button" className="btn-secondary"
            onClick={() => ui.open({ type: 'coin', kind: draft.kind, parentId: existing.id })}>
            Добавить подкатегорию
          </button>
        )}

        {draft.kind === 'debt' && existing && (
          <button type="button" className="btn-secondary" onClick={() => set({ closed: !draft.closed })}>
            {draft.closed ? 'Открыть долг снова' : 'Отметить долг закрытым'}
          </button>
        )}
      </div>

      <button type="button" className="btn-primary" onClick={save}>
        {existing ? 'Сохранить' : 'Создать'}
      </button>
    </>
  )
}
