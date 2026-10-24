import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { diag } from './diag'
import { StoreProvider } from './store'
import { initTelegram, tg } from './telegram'
import { UIProvider } from './ui'
import './styles.css'

diag('boot', tg ? `${tg.platform} v${tg.version} ${innerWidth}x${innerHeight}` : `browser ${innerWidth}x${innerHeight}`)
try {
  initTelegram()
} catch (e) {
  diag('tg-init-failed', String((e as Error)?.stack ?? e))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <StoreProvider fallback={<div className="splash">🪙</div>}>
        <UIProvider>
          <App />
        </UIProvider>
      </StoreProvider>
    </ErrorBoundary>
  </StrictMode>,
)
