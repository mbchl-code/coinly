declare global {
  interface Window {
    __coinlyDiag?: (kind: string, msg: string) => void
  }
}

/** Пишет этап запуска или ошибку в access-лог сервера (GET /__diag). Без пользовательских данных */
export function diag(kind: string, msg = '') {
  window.__coinlyDiag?.(kind, msg)
}
