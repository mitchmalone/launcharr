import { invoke } from '@tauri-apps/api/core'
import { useEffect, useState } from 'react'

import { UsagePanel, type UsageReport } from './UsagePanel'

/** Fast poll: the first usage_status kicks a background journal scan and
 * returns the (possibly empty) cache; polling picks the result up as soon as
 * the scan lands, then rides the 60s server-side cache. */
const REFRESH_MS = 2000

export function UsagePanelContainer({ onClose }: { onClose: () => void }) {
  const [report, setReport] = useState<UsageReport | null>(null)
  const [selected, setSelected] = useState('claude')
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))

  useEffect(() => {
    const refresh = () => {
      invoke<UsageReport>('usage_status')
        .then((r) => {
          setReport(r)
          setNow(Math.floor(Date.now() / 1000))
        })
        .catch(console.error)
    }
    refresh()
    const id = setInterval(refresh, REFRESH_MS)
    return () => clearInterval(id)
  }, [])

  return (
    <UsagePanel
      report={report}
      selected={selected}
      nowSecs={now}
      onSelect={setSelected}
      onClose={onClose}
    />
  )
}
