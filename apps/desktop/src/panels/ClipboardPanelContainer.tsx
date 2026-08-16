import type { Clip } from '@launcharr/core/types'
import { invoke } from '@tauri-apps/api/core'
import { useCallback, useEffect, useState } from 'react'

import { ClipboardPanel } from './ClipboardPanel'

const REFRESH_MS = 2000

/** JS timer is safe: panels live only in the key window (see WifiPanelContainer). */
export function ClipboardPanelContainer({ onClose }: { onClose: () => void }) {
  const [clips, setClips] = useState<Clip[]>([])
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    invoke<Clip[]>('get_clips').then(setClips).catch(console.error)
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, REFRESH_MS)
    return () => clearInterval(id)
  }, [refresh])

  // copy_clip hides the panel window itself (the copy IS the exit).
  const onCopy = useCallback((content: string) => {
    invoke('copy_clip', { content }).catch((e) => setError(String(e)))
  }, [])

  const onDelete = useCallback(
    (id: number) => {
      invoke('delete_clip', { id })
        .then(refresh)
        .catch((e) => setError(String(e)))
    },
    [refresh],
  )

  return (
    <ClipboardPanel
      clips={clips}
      error={error}
      onCopy={onCopy}
      onDelete={onDelete}
      onClose={onClose}
    />
  )
}
