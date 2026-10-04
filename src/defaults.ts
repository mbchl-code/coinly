import type { Coin, CoinKind, State } from './types'

export const COLORS = [
  '#f5a623', '#ff8a3d', '#e5484d', '#f76b8a', '#d16ba5', '#7b61ff',
  '#2f7cf6', '#22b8cf', '#14b8a6', '#2fb36b', '#94c943', '#a1887f', '#607d8b',
]

export const ICONS = [
  '🛒', '🍎', '🥩', '☕', '🍔', '🍕', '🍷', '🚬', '🚌', '🚕', '🚗', '⛽', '✈️',
  '🏠', '💡', '📱', '🌐', '💊', '🏥', '👕', '👟', '💄', '✂️', '🎮', '🎬',
  '🎵', '📚', '🎓', '🏋️', '⚽', '🐶', '👶', '🎁', '💐', '🧾', '🛠️', '📦',
  '💼', '💰', '💵', '💳', '🏦', '🪙', '📈', '💸', '🤝', '🧑', '⭐', '❤️',
]

export const CURRENCIES: { code: string; name: string }[] = [
  { code: 'RUB', name: 'Российский рубль' },
  { code: 'USD', name: 'Доллар США' },
  { code: 'EUR', name: 'Евро' },
  { code: 'KZT', name: 'Казахстанский тенге' },
  { code: 'BYN', name: 'Белорусский рубль' },
  { code: 'UAH', name: 'Украинская гривна' },
  { code: 'UZS', name: 'Узбекский сум' },
  { code: 'KGS', name: 'Киргизский сом' },
  { code: 'AMD', name: 'Армянский драм' },
  { code: 'GEL', name: 'Грузинский лари' },
  { code: 'AZN', name: 'Азербайджанский манат' },
  { code: 'TRY', name: 'Турецкая лира' },
  { code: 'CNY', name: 'Китайский юань' },
  { code: 'AED', name: 'Дирхам ОАЭ' },
  { code: 'THB', name: 'Тайский бат' },
  { code: 'GBP', name: 'Фунт стерлингов' },
  { code: 'RSD', name: 'Сербский динар' },
  { code: 'PLN', name: 'Польский злотый' },
]

export const KIND_LABEL: Record<CoinKind, string> = {
  income: 'Доход',
  account: 'Счёт',
  expense: 'Категория',
  debt: 'Долг',
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

export function newCoin(kind: CoinKind, base: string, parentId?: string): Coin {
  const icon = { income: '💰', account: '💳', expense: '📦', debt: '🧑' }[kind]
  return {
    id: uid(),
    kind,
    name: '',
    icon,
    color: kind === 'income' ? '#2fb36b' : kind === 'account' ? '#2f7cf6' : kind === 'debt' ? '#7b61ff' : COLORS[0],
    parentId,
    ...(kind === 'account' || kind === 'debt' ? { currency: base, initial: 0 } : {}),
    ...(kind === 'debt' ? { direction: 'lent' as const } : {}),
  }
}

function defaultCurrency() {
  const lang = navigator.language.toLowerCase()
  if (lang.endsWith('kz')) return 'KZT'
  if (lang.startsWith('be') || lang.endsWith('by')) return 'BYN'
  if (lang.startsWith('uk')) return 'UAH'
  return 'RUB'
}

export function createDefaultState(): State {
  const base = defaultCurrency()
  let n = 0
  const c = (kind: CoinKind, name: string, icon: string, color: string, extra: Partial<Coin> = {}): Coin => ({
    id: `d${n++}`,
    kind,
    name,
    icon,
    color,
    ...extra,
  })
  const coins: Coin[] = [
    c('income', 'Зарплата', '💼', '#2fb36b'),
    c('income', 'Другое', '🎁', '#94c943'),
    c('account', 'Наличные', '💵', '#14b8a6', { currency: base, initial: 0 }),
    c('account', 'Карта', '💳', '#2f7cf6', { currency: base, initial: 0 }),
    c('expense', 'Продукты', '🛒', '#f5a623'),
    c('expense', 'Кафе', '☕', '#ff8a3d'),
    c('expense', 'Транспорт', '🚌', '#22b8cf'),
    c('expense', 'Дом', '🏠', '#a1887f'),
    c('expense', 'Связь', '📱', '#7b61ff'),
    c('expense', 'Здоровье', '💊', '#e5484d'),
    c('expense', 'Одежда', '👕', '#d16ba5'),
    c('expense', 'Развлечения', '🎮', '#f76b8a'),
    c('expense', 'Подарки', '💐', '#2fb36b'),
    c('expense', 'Разное', '📦', '#607d8b'),
  ]
  coins.push(
    c('expense', 'Супермаркет', '🛒', '#f5a623', { parentId: 'd4' }),
    c('expense', 'Рынок', '🍎', '#f5a623', { parentId: 'd4' }),
  )
  return { v: 1, baseCurrency: base, rates: {}, ratesAt: 0, coins, txs: [], updatedAt: Date.now() }
}
