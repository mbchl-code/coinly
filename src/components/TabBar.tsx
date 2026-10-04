import { haptic } from '../telegram'
import { Icon } from './Icon'

export type Tab = 'coins' | 'history' | 'reports' | 'debts' | 'settings'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'coins', label: 'Монеты', icon: 'coins' },
  { id: 'history', label: 'Операции', icon: 'list' },
  { id: 'reports', label: 'Отчёты', icon: 'chart' },
  { id: 'debts', label: 'Долги', icon: 'debt' },
  { id: 'settings', label: 'Настройки', icon: 'gear' },
]

export function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav className="tabbar" aria-label="Разделы">
      {TABS.map((t) => (
        <button key={t.id} type="button" className="tab" aria-current={tab === t.id ? 'page' : undefined}
          onClick={() => {
            if (t.id !== tab) haptic.select()
            onChange(t.id)
          }}>
          <Icon name={t.icon} size={24} />
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  )
}
