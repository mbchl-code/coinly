import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { canFlow, type CoinMap } from '../selectors'
import { haptic } from '../telegram'
import type { Coin } from '../types'
import { Spring, VelocityTracker } from '../utils/spring'
import { CoinDisc } from './Coin'

const LONG_PRESS = 220
/** Удержание категории (её нельзя тащить) открывает редактор */
const EDIT_PRESS = 450
const SLOP = 8

interface Options {
  map: CoinMap
  onTap: (coin: Coin) => void
  onDrop: (from: Coin, to: Coin) => void
  onLongPress?: (coin: Coin) => void
}

interface Gesture {
  coin: Coin
  el: HTMLElement
  disc: HTMLElement
  pointerId: number
  sx: number
  sy: number
  offX: number
  offY: number
  originX: number
  originY: number
  mouse: boolean
  started: boolean
  longPressed?: boolean
  timer?: ReturnType<typeof setTimeout>
  over: string | null
}

/**
 * Перетаскивание монет. Тач: удержание 220 мс, затем монета «поднимается» и следует за пальцем 1:1
 * (с учётом точки захвата). Мышь: начинаем после сдвига на 8 px. Отпустили мимо — монета
 * возвращается пружиной, унаследовав скорость пальца.
 */
export function useCoinDrag(options: Options) {
  const opts = useRef(options)
  opts.current = options
  const [source, setSource] = useState<Coin | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const ghost = useRef<HTMLDivElement>(null)
  const g = useRef<Gesture | null>(null)
  const pos = useRef({ x: 0, y: 0, s: 1, o: 1 })
  const tracker = useRef(new VelocityTracker())

  const paint = () => {
    const el = ghost.current
    if (!el) return
    const { x, y, s, o } = pos.current
    el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${s})`
    el.style.opacity = String(o)
  }
  const springs = useRef({
    x: new Spring(0, (v) => ((pos.current.x = v), paint())),
    y: new Spring(0, (v) => ((pos.current.y = v), paint())),
    s: new Spring(1, (v) => ((pos.current.s = v), paint())),
    o: new Spring(1, (v) => ((pos.current.o = v), paint())),
  })

  useLayoutEffect(paint, [source])

  const clear = (gest: Gesture | null) => {
    if (!gest) return
    clearTimeout(gest.timer)
    gest.el.classList.remove('pressed')
    g.current = null
  }

  const begin = (gest: Gesture, x: number, y: number) => {
    const r = gest.disc.getBoundingClientRect()
    gest.started = true
    gest.originX = r.left
    gest.originY = r.top
    gest.offX = gest.sx - r.left
    gest.offY = gest.sy - r.top
    gest.el.classList.remove('pressed')
    const sp = springs.current
    sp.x.set(x - gest.offX)
    sp.y.set(y - gest.offY)
    sp.o.set(1)
    sp.s.set(0.94)
    sp.s.to(1.15, { damping: 0.8, response: 0.3 })
    tracker.current.reset()
    setSource(gest.coin)
    haptic.drag()
  }

  const bind = (coin: Coin) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || g.current) return
    const el = e.currentTarget
    const gest: Gesture = {
      coin,
      el,
      disc: el.querySelector('.coin-disc') as HTMLElement,
      pointerId: e.pointerId,
      sx: e.clientX,
      sy: e.clientY,
      offX: 0,
      offY: 0,
      originX: 0,
      originY: 0,
      mouse: e.pointerType === 'mouse',
      started: false,
      over: null,
    }
    el.classList.add('pressed') // мгновенный отклик на нажатие
    const draggable = coin.kind !== 'expense'
    if (draggable && !gest.mouse) gest.timer = setTimeout(() => g.current === gest && begin(gest, gest.sx, gest.sy), LONG_PRESS)
    if (!draggable && opts.current.onLongPress)
      gest.timer = setTimeout(() => {
        if (g.current !== gest) return
        gest.longPressed = true
        el.classList.remove('pressed')
        haptic.drag()
        opts.current.onLongPress?.(coin)
      }, EDIT_PRESS)
    g.current = gest
  }

  useEffect(() => {
    const sp = springs.current

    const move = (e: PointerEvent) => {
      const gest = g.current
      if (!gest || e.pointerId !== gest.pointerId) return
      if (!gest.started) {
        if (Math.hypot(e.clientX - gest.sx, e.clientY - gest.sy) < SLOP) return
        if (gest.mouse && gest.coin.kind !== 'expense') begin(gest, e.clientX, e.clientY)
        else return clear(gest) // палец поехал до удержания — это скролл
      }
      tracker.current.add(e.clientX, e.clientY)
      sp.x.set(e.clientX - gest.offX)
      sp.y.set(e.clientY - gest.offY)
      const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-coin-id]')
      const target = hit ? opts.current.map.get(hit.dataset.coinId!) : undefined
      const over = target && canFlow(gest.coin, target) ? target.id : null
      if (over !== gest.over) {
        gest.over = over
        setOverId(over)
        if (over) haptic.select()
      }
    }

    const finish = (e: PointerEvent, cancelled: boolean) => {
      const gest = g.current
      if (!gest || e.pointerId !== gest.pointerId) return
      clear(gest)
      if (gest.longPressed) return
      if (!gest.started) {
        if (!cancelled) {
          haptic.tap()
          opts.current.onTap(gest.coin)
        }
        return
      }
      const v = tracker.current.get()
      const target = !cancelled && gest.over ? opts.current.map.get(gest.over) : undefined
      setOverId(null)
      if (target) {
        // Монета «падает» в цель, лист открывается сразу — без ожидания анимации
        const disc = document.querySelector(`[data-coin-id="${target.id}"] .coin-disc`)
        const r = disc?.getBoundingClientRect()
        if (r) {
          sp.x.to(r.left, { response: 0.3, velocity: v.x })
          sp.y.to(r.top, { response: 0.3, velocity: v.y })
        }
        sp.s.to(0.5, { response: 0.3 })
        sp.o.to(0, { response: 0.3 }, () => setSource(null))
        haptic.success()
        opts.current.onDrop(gest.coin, target)
      } else {
        // Возврат на место с унаследованной скоростью; немного пружинит — жест нёс импульс
        sp.x.to(gest.originX, { damping: 0.8, response: 0.4, velocity: v.x })
        sp.y.to(gest.originY, { damping: 0.8, response: 0.4, velocity: v.y }, () => setSource(null))
        sp.s.to(1, { damping: 1, response: 0.3 })
      }
    }

    const up = (e: PointerEvent) => finish(e, false)
    const cancel = (e: PointerEvent) => finish(e, true)
    // Пока тащим — блокируем скролл страницы
    const touchMove = (e: TouchEvent) => g.current?.started && e.cancelable && e.preventDefault()

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    document.addEventListener('touchmove', touchMove, { passive: false })
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      document.removeEventListener('touchmove', touchMove)
      Object.values(sp).forEach((s) => s.stop())
    }
  }, [])

  const layer = source
    ? createPortal(
        <div ref={ghost} className="coin-ghost" aria-hidden="true">
          <CoinDisc coin={source} />
        </div>,
        document.body,
      )
    : null

  return { bind, source, overId, layer }
}
