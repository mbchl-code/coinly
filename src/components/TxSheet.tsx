import { useMemo, useState } from 'react'
import { uid } from '../defaults'
import { balances, canFlow, coinCurrency, coinMap, convert, txKind } from '../selectors'
import { useStore } from '../store'
import { confirmDialog, haptic } from '../telegram'
import type { Coin, Tx } from '../types'
import { useUI } from '../ui'
import { evaluate, hasOps, OPS, pressKey, toExpr } from '../utils/calc'
import { currentMonth, todayISO } from '../utils/date'
import { money } from '../utils/format'
import { CoinDisc } from './Coin'
import { Icon } from './Icon'

const KEYS = ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', '.', '0', '⌫', '+']

export function TxSheet({ from, to, txId }: { from?: string; to?: string; txId?: string }) {
  const { state, dispatch } = useStore()
  const ui = useUI()
  const base = state.baseCurrency
  const map = useMemo(() => coinMap(state), [state])
  const bal = useMemo(() => balances(state), [state])
  const existing = txId ? state.txs.find((t) => t.id === txId) : undefined
  const roots = state.coins.filter((c) => !c.parentId && !c.closed)

  const [fromId, setFromId] = useState(() => {
    const id = existing?.from ?? from
    if (id) return id
    const t = to ? map.get(to) : undefined
    const valid = (c?: Coin) => !!c && !c.closed && (t ? canFlow(c, t) : c.kind === 'account')
    // счёт, с которого последний раз платили за эту категорию (или за любую)
    if (t?.kind === 'expense') {
      const recent = [...state.txs].sort((a, b) => b.createdAt - a.createdAt)
      const last = recent.find((x) => x.to === t.id) ?? recent.find((x) => map.get(x.to)?.kind === 'expense')
      if (last && valid(map.get(last.from))) return last.from
    }
    return roots.find(valid)?.id ?? ''
  })
  const [toId, setToId] = useState(() => {
    const id = existing?.to ?? to
    if (id) return id
    const f = map.get(fromId)
    return (f ? roots.find((c) => canFlow(f, c)) : undefined)?.id ?? ''
  })
  const [picking, setPicking] = useState<'from' | 'to' | null>(null)
  const [expr, setExpr] = useState(existing ? toExpr(existing.amount) : '')
  const [expr2, setExpr2] = useState(existing?.amountTo != null ? toExpr(existing.amountTo) : '')
  const [focus, setFocus] = useState<'main' | 'second'>('main')
  const [date, setDate] = useState(existing?.date ?? (ui.month === currentMonth() ? todayISO() : `${ui.month}-01`))
  const [note, setNote] = useState(existing?.note ?? '')
  const [shake, setShake] = useState(0)

  const fromCoin = map.get(fromId)
  const toCoin = map.get(toId)
  const rootOf = (c?: Coin) => (c?.parentId ? map.get(c.parentId) : c)
  const fromRoot = rootOf(fromCoin)
  const toRoot = rootOf(toCoin)

  const fromCur = coinCurrency(fromCoin, base)
  const toCur = coinCurrency(toCoin, base)
  const mainCur = fromCur ?? toCur ?? base
  const twoCurrencies = !!fromCur && !!toCur && fromCur !== toCur

  const amount = evaluate(expr)
  const autoSecond = amount && twoCurrencies ? Math.round(convert(state, amount, fromCur!, toCur!) * 100) / 100 : null
  const amount2 = expr2 ? evaluate(expr2) : autoSecond

  const kind = fromCoin && toCoin ? txKind(map, { from: fromId, to: toId } as Tx) : 'expense'
  const title = (() => {
    if (kind === 'debt') {
      if (toCoin?.kind === 'debt') return toCoin.direction === 'lent' ? 'Дать в долг' : 'Вернуть долг'
      return fromCoin?.direction === 'lent' ? 'Мне вернули долг' : 'Взять в долг'
    }
    return { income: 'Доход', expense: 'Расход', transfer: 'Перевод' }[kind]
  })()

  // Доход или категорию можно переименовать / сменить иконку прямо отсюда
  const editTarget = kind === 'income' ? fromCoin : kind === 'expense' ? toCoin : undefined

  const fromOptions = roots.filter((c) => (toCoin ? canFlow(c, toCoin) || c.id === fromRoot?.id : c.kind !== 'expense'))
  const toOptions = roots.filter((c) => (fromCoin ? canFlow(fromCoin, c) || c.id === toRoot?.id : true))
  const options = picking === 'from' ? fromOptions : picking === 'to' ? toOptions : []

  const children = (root?: Coin) => (root ? state.coins.filter((c) => c.parentId === root.id) : [])

  const press = (key: string) => {
    haptic.select()
    if (focus === 'second') setExpr2((e) => pressKey(e, key))
    else setExpr((e) => pressKey(e, key))
  }

  const save = () => {
    if (!fromCoin || !toCoin || !amount || amount <= 0 || (twoCurrencies && (!amount2 || amount2 <= 0))) {
      haptic.error()
      setShake((n) => n + 1)
      return
    }
    const tx: Tx = {
      id: existing?.id ?? uid(),
      from: fromId,
      to: toId,
      amount,
      ...(twoCurrencies ? { amountTo: amount2! } : {}),
      date,
      ...(note.trim() ? { note: note.trim() } : {}),
      createdAt: existing?.createdAt ?? Date.now(),
    }
    dispatch(existing ? { type: 'updateTx', tx } : { type: 'addTx', tx })
    haptic.success()
    ui.close()
  }

  const remove = async () => {
    if (!existing || !(await confirmDialog('Удалить операцию?'))) return
    dispatch({ type: 'deleteTx', id: existing.id })
    haptic.success()
    ui.close()
  }

  const slot = (side: 'from' | 'to', coin?: Coin) => (
    <button type="button" className="flow-slot" aria-expanded={picking === side}
      onClick={() => {
        haptic.select()
        setPicking(picking === side ? null : side)
      }}>
      {coin ? <CoinDisc coin={coin} size={44} /> : <div className="coin-disc empty" />}
      <span className="flow-name">
        {coin?.name ?? 'Выбрать'}
        <Icon name={picking === side ? 'up' : 'down'} size={14} stroke={2.4} />
      </span>
      {coin && (coin.kind === 'account' || coin.kind === 'debt') && (
        <span className="flow-sub">{money(bal.get(coin.id) ?? 0, coin.currency ?? base)}</span>
      )}
    </button>
  )

  const subRow = (root: Coin | undefined, selected: string, set: (id: string) => void) => {
    const kids = children(root)
    if (!root || !kids.length) return null
    return (
      <div className="chips" role="radiogroup" aria-label="Подкатегория">
        {[root, ...kids].map((c) => (
          <button key={c.id} type="button" role="radio" aria-checked={selected === c.id}
            className="chip" onClick={() => (haptic.select(), set(c.id))}>
            {c.id === root.id ? 'Без подкатегории' : `${c.icon} ${c.name}`}
          </button>
        ))}
      </div>
    )
  }

  return (
    <>
      <div className="sheet-head" data-sheet-drag>
        <div className="sheet-title-row" data-sheet-drag>
          <h2 className={`sheet-title kind-${kind}`}>{title}</h2>
          <span className="title-actions">
            {editTarget && (
              <button type="button" className="icon-btn" aria-label={`Изменить «${editTarget.name}»`}
                onClick={() => ui.open({ type: 'coin', id: editTarget.id, kind: editTarget.kind })}>
                <Icon name="pencil" />
              </button>
            )}
            {existing && (
              <button type="button" className="icon-btn danger" onClick={remove} aria-label="Удалить">
                <Icon name="trash" />
              </button>
            )}
          </span>
        </div>
        <div className="flow" data-sheet-drag>
          {slot('from', fromRoot)}
          <span className="flow-arrow"><Icon name="arrow" /></span>
          {slot('to', toRoot)}
        </div>
      </div>

      {picking && (
        <div className="picker">
          {options.map((c) => {
            const selected = (picking === 'from' ? fromRoot : toRoot)?.id === c.id
            return (
              <button key={c.id} type="button" className="picker-item" aria-pressed={selected}
                onClick={() => {
                  haptic.select()
                  if (picking === 'from') setFromId(c.id)
                  else setToId(c.id)
                  setPicking(null)
                }}>
                <CoinDisc coin={c} size={40} />
                <span>{c.name}</span>
              </button>
            )
          })}
        </div>
      )}

      {subRow(fromRoot?.kind === 'income' ? fromRoot : undefined, fromId, setFromId)}
      {subRow(toRoot?.kind === 'expense' ? toRoot : undefined, toId, setToId)}

      <button type="button" key={`a${shake}`} className={`amount kind-${kind}${focus === 'main' ? ' focused' : ''}${shake ? ' shake' : ''}`}
        onClick={() => setFocus('main')}>
        <span className="amount-value">{expr || '0'}</span>
        <span className="amount-cur">{mainCur}</span>
        {hasOps(expr) && amount != null && <span className="amount-result">= {money(amount, mainCur)}</span>}
      </button>
      {twoCurrencies && (
        <button type="button" className={`amount amount-second${focus === 'second' ? ' focused' : ''}`}
          onClick={() => setFocus('second')}>
          <span className="amount-label">Зачислено</span>
          <span className="amount-value">{expr2 || toExpr(autoSecond ?? 0) || '0'}</span>
          <span className="amount-cur">{toCur}</span>
        </button>
      )}

      <div className="tx-meta">
        <label className="date-chip">
          <Icon name="calendar" size={18} />
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </label>
        <input className="note-input" placeholder="Комментарий" value={note} maxLength={120}
          onChange={(e) => setNote(e.target.value)} enterKeyHint="done"
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()} />
      </div>

      <div className="keypad">
        {KEYS.map((k) => (
          <button key={k} type="button" className={`key${(OPS as readonly string[]).includes(k) ? ' op' : ''}`}
            onPointerDown={(e) => {
              e.preventDefault()
              press(k)
            }}
            onClick={(e) => e.detail === 0 && press(k)}
            aria-label={k === '⌫' ? 'Стереть' : k}>
            {k === '.' ? ',' : k}
          </button>
        ))}
      </div>
      <button type="button" className="btn-primary" onClick={save}>
        {existing ? 'Сохранить' : 'Добавить'}
      </button>
    </>
  )
}
