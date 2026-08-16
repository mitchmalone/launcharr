import { invoke } from '@tauri-apps/api/core'
import { useCallback, useEffect, useState } from 'react'

import { type ScanNetwork, WifiPanel, type WifiStatus } from './WifiPanel'

const REFRESH_MS = 3000

/**
 * Wires WifiPanel to the wifi_* commands. A JS interval is safe here — unlike
 * the bar, this panel only exists inside the key launcher window, which WebKit
 * never background-throttles (JOURNAL 2026-08-16 for the bar's contrast).
 */
export function WifiPanelContainer({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<WifiStatus | null>(null)
  const [networks, setNetworks] = useState<string[]>([])
  const [scanned, setScanned] = useState<ScanNetwork[] | null>(null)
  const [scanning, setScanning] = useState(false)
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
    (ssid: string, password?: string) => {
      setBusy(ssid)
      setError(null)
      invoke('wifi_connect', { ssid, password: password ?? null })
        .then(refresh)
        .catch((e) => setError(String(e)))
        .finally(() => setBusy(null))
    },
    [refresh],
  )

  // system_profiler takes seconds; the command is async and one-shot per press.
  const onScan = useCallback(() => {
    setScanning(true)
    setError(null)
    invoke<ScanNetwork[]>('wifi_scan')
      .then(setScanned)
      .catch((e) => setError(String(e)))
      .finally(() => setScanning(false))
  }, [])

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
      scanned={scanned}
      scanning={scanning}
      busy={busy}
      error={error}
      onConnect={onConnect}
      onScan={onScan}
      onTogglePower={onTogglePower}
      onClose={onClose}
    />
  )
}
