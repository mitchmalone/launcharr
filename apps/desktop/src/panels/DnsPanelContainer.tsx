import { invoke } from '@tauri-apps/api/core'
import { useEffect, useState } from 'react'

import { DnsPanel } from './DnsPanel'
import type { WifiStatus } from './WifiPanel'

const REFRESH_MS = 5000

/** JS timer is safe: panels live only in the key window (see WifiPanelContainer). */
export function DnsPanelContainer({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<WifiStatus | null>(null)
  useEffect(() => {
    const tick = () =>
      invoke<WifiStatus>('wifi_status').then(setStatus).catch(console.error)
    tick()
    const id = setInterval(tick, REFRESH_MS)
    return () => clearInterval(id)
  }, [])
  return <DnsPanel status={status} onClose={onClose} />
}
