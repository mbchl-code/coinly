import { haptic } from '../telegram'
import { useUI } from '../ui'
import { currentMonth, monthLabel, shiftMonth } from '../utils/date'
import { Icon } from './Icon'

export function MonthBar() {
  const { month, setMonth } = useUI()
  const go = (d: number) => {
    haptic.select()
    setMonth(shiftMonth(month, d))
  }
  const isCurrent = month === currentMonth()
  return (
    <div className="month-bar">
      <button type="button" className="icon-btn" onClick={() => go(-1)} aria-label="Предыдущий месяц">
        <Icon name="left" />
      </button>
      <button type="button" className="month-label" onClick={() => !isCurrent && setMonth(currentMonth())}
        title={isCurrent ? undefined : 'Вернуться к текущему месяцу'}>
        {monthLabel(month)}
      </button>
      <button type="button" className="icon-btn" onClick={() => go(1)} aria-label="Следующий месяц">
        <Icon name="right" />
      </button>
    </div>
  )
}
