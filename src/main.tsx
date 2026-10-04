import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { StoreProvider } from './store'
import { initTelegram } from './telegram'
import { UIProvider } from './ui'
import './styles.css'

initTelegram()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider fallback={<div className="splash">🪙</div>}>
      <UIProvider>
        <App />
      </UIProvider>
    </StoreProvider>
  </StrictMode>,
)
