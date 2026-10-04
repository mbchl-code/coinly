import type { CSSProperties, PointerEvent } from 'react'
import type { Coin as CoinT } from '../types'

export type CoinState = 'source' | 'target' | 'over' | 'dim' | null

interface Props {
  coin: CoinT
  amount?: string
  /** 0..∞ — доля бюджета; null — бюджета нет */
  progress?: number | null
  negative?: boolean
  state?: CoinState
  onPointerDown?: (e: PointerEvent<HTMLDivElement>) => void
  onActivate?: () => void
}

export function Ring({ progress, over }: { progress: number; over: boolean }) {
  const r = 30
  const c = 2 * Math.PI * r
  return (
    <svg className="coin-ring" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r={r} className="ring-track" />
      <circle cx="32" cy="32" r={r} className={over ? 'ring-bar over' : 'ring-bar'}
        strokeDasharray={`${Math.min(progress, 1) * c} ${c}`} />
    </svg>
  )
}

export function CoinDisc({ coin, progress, size }: { coin: CoinT; progress?: number | null; size?: number }) {
  return (
    <div className="coin-disc" style={{ '--c': coin.color, ...(size ? { '--size': `${size}px` } : {}) } as CSSProperties}>
      {progress != null && <Ring progress={progress} over={progress > 1} />}
      <span className="coin-icon">{coin.icon}</span>
    </div>
  )
}

export function Coin({ coin, amount, progress, negative, state, onPointerDown, onActivate }: Props) {
  return (
    <div
      className="coin"
      data-coin-id={coin.id}
      data-state={state ?? undefined}
      role="button"
      tabIndex={0}
      aria-label={`${coin.name}${amount ? `, ${amount}` : ''}`}
      onPointerDown={onPointerDown}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onActivate?.())}
    >
      <CoinDisc coin={coin} progress={progress} />
      <div className="coin-name">{coin.name}</div>
      {amount !== undefined && (
        <div className={`coin-amount${negative || (progress ?? 0) > 1 ? ' neg' : ''}`}>{amount}</div>
      )}
    </div>
  )
}

export function AddCoin({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="coin coin-add" onClick={onClick} aria-label={label}>
      <div className="coin-disc">
        <span className="coin-icon">+</span>
      </div>
      <div className="coin-name">{label}</div>
    </button>
  )
}
