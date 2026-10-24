import { Component, type ReactNode } from 'react'
import { diag } from '../diag'

/** Вместо белого экрана при падении — понятное сообщение и перезагрузка */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    diag('crash', `${error.message}\n${error.stack ?? ''}`)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="crash">
        <div className="empty-icon">😵</div>
        <b>Что-то пошло не так</b>
        <p>Мы уже получили отчёт об ошибке. Попробуйте перезагрузить приложение.</p>
        <code>{error.message}</code>
        <button type="button" className="btn-primary" onClick={() => location.reload()}>
          Перезагрузить
        </button>
      </div>
    )
  }
}
