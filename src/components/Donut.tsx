import type { ReactNode } from 'react'

export function Donut({ items, children, size = 200 }: {
  items: { id: string; value: number; color: string }[]
  children?: ReactNode
  size?: number
}) {
  const stroke = 22
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const total = items.reduce((s, i) => s + i.value, 0)
  const gap = items.length > 1 ? 3 : 0
  let offset = 0
  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="donut-track" strokeWidth={stroke} />
        {total > 0 &&
          items.map((it) => {
            const len = (it.value / total) * c
            const el = (
              <circle key={it.id} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={it.color} strokeWidth={stroke}
                strokeDasharray={`${Math.max(len - gap, 0.01)} ${c}`} strokeDashoffset={-offset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`} />
            )
            offset += len
            return el
          })}
      </svg>
      <div className="donut-center">{children}</div>
    </div>
  )
}
