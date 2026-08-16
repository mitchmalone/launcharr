import { invoke } from '@tauri-apps/api/core'
import { useCallback, useEffect, useState } from 'react'

import { AudioPanel, type AudioStatus } from './AudioPanel'

const REFRESH_MS = 2000

/** JS timer is safe: panels live only in the key window (see WifiPanelContainer). */
export function AudioPanelContainer({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<AudioStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    invoke<AudioStatus>('audio_status').then(setStatus).catch(console.error)
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, REFRESH_MS)
    return () => clearInterval(id)
  }, [refresh])

  // Optimistic: paint the new value now, osascript catches up behind it.
  const onSetVolume = useCallback((input: boolean, pct: number) => {
    setStatus((prev) =>
      prev
        ? input
          ? { ...prev, inputVolume: pct }
          : { ...prev, outputVolume: pct }
        : prev,
    )
    invoke('audio_set_volume', { input, pct }).catch((e) => setError(String(e)))
  }, [])

  const onSetDefault = useCallback(
    (id: number, input: boolean) => {
      setError(null)
      invoke('audio_set_default', { id, input })
        .then(refresh)
        .catch((e) => setError(String(e)))
    },
    [refresh],
  )

  const onToggleMute = useCallback(() => {
    if (!status) return
    const muted = !status.outputMuted
    setStatus((prev) => (prev ? { ...prev, outputMuted: muted } : prev))
    invoke('audio_set_muted', { muted }).catch((e) => setError(String(e)))
  }, [status])

  return (
    <AudioPanel
      status={status}
      error={error}
      onSetVolume={onSetVolume}
      onSetDefault={onSetDefault}
      onToggleMute={onToggleMute}
      onClose={onClose}
    />
  )
}
