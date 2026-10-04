export type CoinKind = 'income' | 'account' | 'expense' | 'debt'

export interface Coin {
  id: string
  kind: CoinKind
  name: string
  icon: string
  color: string
  /** Подкатегория (только income/expense, один уровень вложенности) */
  parentId?: string
  /** Валюта счёта или долга. У доходов и расходов валюты нет — они в базовой */
  currency?: string
  /** Стартовый баланс счёта / стартовая сумма долга */
  initial?: number
  /** План на месяц в базовой валюте (income/expense) */
  budget?: number
  /** Для долга: lent — мне должны, borrowed — я должен */
  direction?: 'lent' | 'borrowed'
  closed?: boolean
}

export interface Tx {
  id: string
  from: string
  to: string
  /** Сумма в валюте `from`; если `from` — источник дохода, то в валюте `to` */
  amount: number
  /** Сумма в валюте `to`, когда валюты счетов различаются */
  amountTo?: number
  /** YYYY-MM-DD, локальная дата */
  date: string
  note?: string
  createdAt: number
}

export interface State {
  v: 1
  baseCurrency: string
  /** Сколько единиц базовой валюты стоит 1 единица валюты (ключ — код) */
  rates: Record<string, number>
  ratesAt: number
  coins: Coin[]
  txs: Tx[]
  updatedAt: number
}

export type TxKind = 'income' | 'expense' | 'transfer' | 'debt'
