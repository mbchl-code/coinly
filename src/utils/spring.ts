/**
 * Прерываемая пружина в параметрах Apple: damping ratio (1 = без перелёта) и response (сек).
 * Новая цель подхватывает текущее значение и скорость — анимацию можно «поймать» на лету.
 */
export interface SpringConfig {
  damping?: number
  response?: number
}

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export class Spring {
  value: number
  velocity = 0
  private target: number
  private raf = 0
  private last = 0
  private cfg: Required<SpringConfig> = { damping: 1, response: 0.35 }
  private onRest?: () => void
  private onChange: (v: number) => void

  constructor(value: number, onChange: (v: number) => void) {
    this.value = this.target = value
    this.onChange = onChange
  }

  /** Мгновенно (во время 1:1 трекинга пальца) */
  set(value: number, velocity = 0) {
    this.stop()
    this.value = this.target = value
    this.velocity = velocity
    this.onChange(value)
  }

  to(target: number, cfg: SpringConfig & { velocity?: number } = {}, onRest?: () => void) {
    this.target = target
    this.cfg = { damping: cfg.damping ?? 1, response: cfg.response ?? 0.35 }
    if (cfg.velocity !== undefined) this.velocity = cfg.velocity
    this.onRest = onRest
    if (reducedMotion()) {
      this.set(target)
      onRest?.()
      return
    }
    if (!this.raf) {
      this.last = performance.now()
      this.raf = requestAnimationFrame(this.tick)
    }
  }

  stop() {
    cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  private tick = (now: number) => {
    const { damping, response } = this.cfg
    const stiffness = (2 * Math.PI / response) ** 2
    const friction = (4 * Math.PI * damping) / response
    let dt = Math.min((now - this.last) / 1000, 1 / 30)
    this.last = now
    // Полунеявный Эйлер мелкими шагами — стабильно при любом FPS
    while (dt > 0) {
      const h = Math.min(dt, 1 / 240)
      const force = -stiffness * (this.value - this.target) - friction * this.velocity
      this.velocity += force * h
      this.value += this.velocity * h
      dt -= h
    }
    const settled = Math.abs(this.velocity) < 4 && Math.abs(this.value - this.target) < 0.5
    if (settled) {
      this.value = this.target
      this.velocity = 0
      this.raf = 0
      this.onChange(this.value)
      const cb = this.onRest
      this.onRest = undefined
      cb?.()
      return
    }
    this.onChange(this.value)
    this.raf = requestAnimationFrame(this.tick)
  }
}

/** Проекция точки остановки по скорости броска (формула Apple, как у скролла) */
export function project(velocity: number, decelerationRate = 0.998) {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate)
}

/** Резиновое сопротивление за границей */
export function rubberband(overshoot: number, dimension: number, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot))
}

/** Скорость по истории последних точек (px/s) */
export class VelocityTracker {
  private pts: { x: number; y: number; t: number }[] = []
  add(x: number, y: number) {
    const t = performance.now()
    this.pts.push({ x, y, t })
    while (this.pts.length > 2 && t - this.pts[0].t > 100) this.pts.shift()
  }
  get() {
    const p = this.pts
    if (p.length < 2) return { x: 0, y: 0 }
    const a = p[0]
    const b = p[p.length - 1]
    const dt = (b.t - a.t) / 1000 || 1
    return { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt }
  }
  reset() {
    this.pts = []
  }
}
