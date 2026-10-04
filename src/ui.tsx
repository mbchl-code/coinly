import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { CoinKind } from './types'
import { currentMonth } from './utils/date'

export type SheetSpec =
  | { type: 'tx'; from?: string; to?: string; txId?: string }
  | { type: 'coin'; id?: string; kind: CoinKind; parentId?: string }

interface UI {
  month: string
  setMonth: (m: string) => void
  sheet: SheetSpec | null
  sheetKey: number
  closing: boolean
  open: (s: SheetSpec) => void
  /** Запросить закрытие — лист сам доиграет анимацию и вызовет dismissed() */
  close: () => void
  dismissed: () => void
}

const Ctx = createContext<UI | null>(null)

export function UIProvider({ children }: { children: ReactNode }) {
  const [month, setMonth] = useState(currentMonth)
  const [sheet, setSheet] = useState<SheetSpec | null>(null)
  const [sheetKey, setKey] = useState(0)
  const [closing, setClosing] = useState(false)

  const open = useCallback((s: SheetSpec) => {
    setSheet(s)
    setKey((k) => k + 1)
    setClosing(false)
  }, [])
  const close = useCallback(() => setClosing(true), [])
  const dismissed = useCallback(() => {
    setSheet(null)
    setClosing(false)
  }, [])

  const value = useMemo(
    () => ({ month, setMonth, sheet, sheetKey, closing, open, close, dismissed }),
    [month, sheet, sheetKey, closing, open, close, dismissed],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useUI() {
  const ui = useContext(Ctx)
  if (!ui) throw new Error('useUI outside provider')
  return ui
}
