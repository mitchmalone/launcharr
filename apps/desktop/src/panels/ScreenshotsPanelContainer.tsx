import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { Screenshot, ScreenshotAction } from '../lib/screenshots'
import { ScreenshotsPanel } from './ScreenshotsPanel'

const REFRESH_MS = 2000

/** JS timer is safe: panels live only in the key window (see WifiPanelContainer). */
export function ScreenshotsPanelContainer({
  onClose,
}: {
  onClose: () => void
}) {
  const [shots, setShots] = useState<Screenshot[]>([])
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const pending = useRef(new Set<string>())

  const refresh = useCallback(() => {
    invoke<Screenshot[]>('list_screenshots')
      .then(setShots)
      .catch((e) => setError(String(e?.detail ?? e)))
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, REFRESH_MS)
    return () => clearInterval(id)
  }, [refresh])

  const onNeedThumb = useCallback((path: string) => {
    if (pending.current.has(path)) return
    pending.current.add(path)
    invoke<string>('screenshot_thumb', { path })
      .then((file) =>
        setThumbs((t) => ({ ...t, [path]: convertFileSrc(file) })),
      )
      .catch(() => pending.current.delete(path))
  }, [])

  const action = useCallback((path: string, a: ScreenshotAction) => {
    invoke('screenshot_action', { path, action: a }).catch((e) =>
      setError(String(e?.detail ?? e)),
    )
  }, [])
  const onCopy = useCallback((p: string) => action(p, 'copy'), [action])
  const onOpen = useCallback((p: string) => action(p, 'open'), [action])
  const onReveal = useCallback((path: string) => {
    invoke('reveal_item', { path }).catch((e) =>
      setError(String(e?.detail ?? e)),
    )
  }, [])

  const folder = shots[0]?.path.replace(/\/[^/]+$/, '') ?? ''
  return (
    <ScreenshotsPanel
      shots={shots}
      folder={abbreviateHome(folder)}
      thumbs={thumbs}
      onNeedThumb={onNeedThumb}
      onCopy={onCopy}
      onReveal={onReveal}
      onOpen={onOpen}
      onClose={onClose}
      error={error}
    />
  )
}

function abbreviateHome(path: string): string {
  return path.replace(/^\/Users\/[^/]+/, '~')
}
