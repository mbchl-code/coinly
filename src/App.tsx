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

export default function App() {
  const [tab, setTab] = useState<Tab>('coins')
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [tab])

  return (
    <>
      <main className="screen">
        {tab === 'coins' && <Home />}
        {tab === 'history' && <History />}
        {tab === 'reports' && <Reports />}
        {tab === 'debts' && <Debts />}
        {tab === 'settings' && <Settings />}
      </main>
      <TabBar tab={tab} onChange={setTab} />
      <SheetHost />
    </>
  )
}
