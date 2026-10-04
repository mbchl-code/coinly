import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useBackButton } from '../telegram'
import { useUI } from '../ui'
import { project, rubberband, Spring, VelocityTracker } from '../utils/spring'

/**
 * Нижний лист. Въезжает пружиной, тянется пальцем за шапку ([data-sheet-drag]) 1:1,
 * при отпускании решение «закрыть / вернуть» принимается по спроецированной точке броска.
 */
export function Sheet({ children, label }: { children: ReactNode; label: string }) {
  const ui = useUI()
  const panel = useRef<HTMLDivElement>(null)
  const backdrop = useRef<HTMLDivElement>(null)
  const rootEl = useRef<HTMLDivElement>(null)
  const spring = useRef<Spring | null>(null)
  const drag = useRef<{ startY: number; from: number; id: number } | null>(null)
  const tracker = useRef(new VelocityTracker())

  const height = () => panel.current?.offsetHeight || window.innerHeight

  useLayoutEffect(() => {
    const s = new Spring(height(), (y) => {
      if (panel.current) panel.current.style.transform = `translate3d(0, ${y}px, 0)`
      if (backdrop.current) backdrop.current.style.opacity = String(1 - Math.min(Math.max(y / height(), 0), 1))
    })
    s.set(height())
    s.to(0, { damping: 1, response: 0.38 })
    spring.current = s
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      s.stop()
      document.body.style.overflow = prev
    }
  }, [])

  const dismiss = (velocity?: number) => {
    // Ввод не блокируем: пока лист уезжает, касания уже проходят к экрану под ним
    if (rootEl.current) rootEl.current.style.pointerEvents = 'none'
    spring.current?.to(height(), { damping: 1, response: 0.32, velocity }, ui.dismissed)
  }

  useEffect(() => {
    if (ui.closing) dismiss()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.closing])

  useBackButton(true, ui.close)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && ui.close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ui.close])

  const onPointerDown = (e: React.PointerEvent) => {
    const t = e.target as Element
    if (!t.closest('[data-sheet-drag]') || t.closest('button, input, select, textarea, a')) return
    spring.current?.stop() // ловим лист на лету — продолжаем с текущего положения
    drag.current = { startY: e.clientY, from: spring.current?.value ?? 0, id: e.pointerId }
    tracker.current.reset()
    tracker.current.add(0, e.clientY)
    panel.current?.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    tracker.current.add(0, e.clientY)
    const raw = d.from + (e.clientY - d.startY)
    spring.current?.set(raw < 0 ? rubberband(raw, height()) : raw)
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    const v = tracker.current.get().y
    const y = spring.current?.value ?? 0
    if (y + project(v) > height() * 0.45) dismiss(v)
    else spring.current?.to(0, { damping: 0.8, response: 0.3, velocity: v })
  }

  return createPortal(
    <div ref={rootEl} className="sheet-root">
      <div ref={backdrop} className="sheet-backdrop" onClick={ui.close} />
      <div
        ref={panel}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="sheet-grip" data-sheet-drag />
        {children}
      </div>
    </div>,
    document.body,
  )
}
