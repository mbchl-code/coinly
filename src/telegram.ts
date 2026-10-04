import { useEffect, useRef } from 'react'

type Impact = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'
type Cb<T> = (error: string | null, result?: T) => void

interface TgWebApp {
  initData: string
  version: string
  platform: string
  colorScheme: 'light' | 'dark'
  themeParams: Record<string, string | undefined>
  ready(): void
  expand(): void
  isVersionAtLeast(version: string): boolean
  disableVerticalSwipes?(): void
  setHeaderColor(color: string): void
  setBackgroundColor(color: string): void
  setBottomBarColor?(color: string): void
  showConfirm(message: string, cb: (ok: boolean) => void): void
  showAlert(message: string, cb?: () => void): void
  onEvent(event: string, cb: () => void): void
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void }
  HapticFeedback: {
    impactOccurred(style: Impact): void
    notificationOccurred(type: 'error' | 'success' | 'warning'): void
    selectionChanged(): void
  }
  CloudStorage: {
    setItem(key: string, value: string, cb?: Cb<boolean>): void
    getItems(keys: string[], cb: Cb<Record<string, string>>): void
    removeItems(keys: string[], cb?: Cb<boolean>): void
    getKeys(cb: Cb<string[]>): void
  }
}

declare global {
  interface Window {
    Telegram?: { WebApp: TgWebApp }
  }
}

const raw = window.Telegram?.WebApp
/** WebApp внутри Telegram; вне Telegram скрипт тоже грузится, но platform === 'unknown' */
export const tg: TgWebApp | null = raw && raw.platform !== 'unknown' ? raw : null

const supports = (v: string) => !!tg && tg.isVersionAtLeast(v)

function setScheme(dark: boolean) {
  document.documentElement.dataset.scheme = dark ? 'dark' : 'light'
}

export function initTelegram() {
  if (!tg) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    setScheme(mq.matches)
    mq.addEventListener('change', (e) => setScheme(e.matches))
    return
  }
  setScheme(tg.colorScheme === 'dark')
  document.documentElement.classList.add('tg')
  tg.ready()
  tg.expand()
  if (supports('7.7')) tg.disableVerticalSwipes?.()
  const applyColors = () => {
    setScheme(tg.colorScheme === 'dark')
    const bg = tg.themeParams.secondary_bg_color ?? tg.themeParams.bg_color
    if (!bg || !supports('6.1')) return
    tg.setHeaderColor(bg)
    tg.setBackgroundColor(bg)
    if (supports('7.10')) tg.setBottomBarColor?.(tg.themeParams.bg_color ?? bg)
  }
  applyColors()
  tg.onEvent('themeChanged', applyColors)
}

const hf = () => (supports('6.1') ? tg!.HapticFeedback : null)
export const haptic = {
  tap: () => hf()?.impactOccurred('light'),
  drag: () => hf()?.impactOccurred('medium'),
  select: () => hf()?.selectionChanged(),
  success: () => hf()?.notificationOccurred('success'),
  error: () => hf()?.notificationOccurred('error'),
}

export function confirmDialog(message: string): Promise<boolean> {
  if (supports('6.2')) return new Promise((resolve) => tg!.showConfirm(message, resolve))
  return Promise.resolve(window.confirm(message))
}

export function alertDialog(message: string): Promise<void> {
  if (supports('6.2')) return new Promise((resolve) => tg!.showAlert(message, resolve))
  window.alert(message)
  return Promise.resolve()
}

/** Показывает системную кнопку «Назад» Telegram, пока active === true */
export function useBackButton(active: boolean, handler: () => void) {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    if (!active || !supports('6.1')) return
    const cb = () => ref.current()
    tg!.BackButton.onClick(cb)
    tg!.BackButton.show()
    return () => {
      tg!.BackButton.offClick(cb)
      tg!.BackButton.hide()
    }
  }, [active])
}

function call<T>(fn: (cb: Cb<T>) => void): Promise<T> {
  return new Promise((resolve, reject) =>
    fn((err, res) => (err ? reject(new Error(err)) : resolve(res as T))),
  )
}

/** Промисифицированный CloudStorage (Bot API 6.9+), null вне Telegram */
export const cloud = supports('6.9')
  ? {
      getItems: (keys: string[]) => call<Record<string, string>>((cb) => tg!.CloudStorage.getItems(keys, cb)),
      setItem: (key: string, value: string) => call<boolean>((cb) => tg!.CloudStorage.setItem(key, value, cb)),
      removeItems: (keys: string[]) => call<boolean>((cb) => tg!.CloudStorage.removeItems(keys, cb)),
      getKeys: () => call<string[]>((cb) => tg!.CloudStorage.getKeys(cb)),
    }
  : null
