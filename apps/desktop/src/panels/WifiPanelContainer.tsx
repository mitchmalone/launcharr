import { invoke } from '@tauri-apps/api/core'
import { useCallback, useEffect, useState } from 'react'

import { WifiPanel, type WifiStatus } from './WifiPanel'

const REFRESH_MS = 3000

/**
 * Wires WifiPanel to the wifi_* commands. A JS interval is safe here — unlike
 * the bar, this panel only exists inside the key launcher window, which WebKit
 * never background-throttles (JOURNAL 2026-08-16 for the bar's contrast).
 */
export function WifiPanelContainer({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<WifiStatus | null>(null)
  const [networks, setNetworks] = useState<string[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    invoke<WifiStatus>('wifi_status').then(setStatus).catch(console.error)
    invoke<string[]>('wifi_known_networks')
      .then(setNetworks)
      .catch(console.error)
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, REFRESH_MS)
    return () => clearInterval(id)
  }, [refresh])

  const onConnect = useCallback(
    (ssid: string) => {
      setBusy(ssid)
      setError(null)
      invoke('wifi_connect', { ssid })
        .then(refresh)
        .catch((e) => setError(String(e)))
        .finally(() => setBusy(null))
    },
    [refresh],
  )

  const onTogglePower = useCallback(() => {
    if (!status) return
    invoke('wifi_set_power', { on: !status.power })
      .then(refresh)
      .catch((e) => setError(String(e)))
  }, [status, refresh])

  return (
    <WifiPanel
      status={status}
      networks={networks}
      busy={busy}
      error={error}
      onConnect={onConnect}
      onTogglePower={onTogglePower}
      onClose={onClose}
    />
  )
}
