import { useEffect, useState } from 'react'
import { CoinSheet } from './components/CoinSheet'
import { Sheet } from './components/Sheet'
import { TabBar, type Tab } from './components/TabBar'
import { TxSheet } from './components/TxSheet'
import { Debts } from './screens/Debts'
import { History } from './screens/History'
import { Home } from './screens/Home'
import { Reports } from './screens/Reports'
import { Settings } from './screens/Settings'
import { diag } from './diag'
import { subscribeStatus, type SyncStatus } from './storage'
import { useUI } from './ui'

function SheetHost() {
  const { sheet, sheetKey } = useUI()
  if (!sheet) return null
  if (sheet.type === 'tx')
    return (
      <Sheet key={sheetKey} label="Операция">
        <TxSheet from={sheet.from} to={sheet.to} txId={sheet.txId} />
      </Sheet>
    )
  return (
    <Sheet key={sheetKey} label="Редактирование">
      <CoinSheet id={sheet.id} kind={sheet.kind} parentId={sheet.parentId} />
    </Sheet>
  )
}

/** Заметное предупреждение, когда изменения не доходят до сервера */
function SyncBanner() {
  const [s, setS] = useState<SyncStatus | null>(null)
  useEffect(() => subscribeStatus(setS), [])
  if (!s) return null
  const text = s.authError
    ? 'Сессия устарела — закройте и снова откройте Coinly'
    : s.offline && s.pending
      ? `Нет связи с сервером · не отправлено: ${s.pending}`
      : null
  return text ? <div className="sync-banner" role="status">{text}</div> : null
}

export default function App() {
  const [tab, setTab] = useState<Tab>('coins')
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [tab])

  useEffect(() => {
    diag('rendered')
  }, [])

  return (
    <>
      <main className="screen">
        {tab === 'coins' && <Home />}
        {tab === 'history' && <History />}
        {tab === 'reports' && <Reports />}
        {tab === 'debts' && <Debts />}
        {tab === 'settings' && <Settings />}
      </main>
      <SyncBanner />
      <TabBar tab={tab} onChange={setTab} />
      <SheetHost />
    </>
  )
}
