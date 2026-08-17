import { invoke } from '@tauri-apps/api/core'
import { useCallback, useEffect, useState } from 'react'

import { type DesktopStatus, desktopStatus } from '../lib/desktop'
import {
  type AerospaceAction,
  AerospacePanel,
  type AerospaceWorkspace,
} from './AerospacePanel'

const REFRESH_MS = 2000

/** JS timer is safe: panels live only in the key window (see WifiPanelContainer). */
export function AerospacePanelContainer({ onClose }: { onClose: () => void }) {
  const [workspaces, setWorkspaces] = useState<AerospaceWorkspace[] | null>(
    null,
  )
  const [status, setStatus] = useState<DesktopStatus | null>(null)
  const refresh = useCallback(() => {
    invoke<AerospaceWorkspace[]>('aerospace_workspaces')
      .then(setWorkspaces)
      .catch(console.error)
  }, [])
  useEffect(() => {
    refresh()
    desktopStatus().then(setStatus).catch(console.error)
    const id = setInterval(refresh, REFRESH_MS)
    return () => clearInterval(id)
  }, [refresh])
  const onAction = (action: AerospaceAction) => {
    invoke('aerospace_action', { action })
      .then(() => {
        // Workspace switches and pause/resume dismiss like a launch; the rest stay.
        if (action.kind === 'workspace' || action.kind === 'toggle') {
          invoke('hide_panel').catch(console.error)
        } else {
          refresh()
        }
      })
      .catch(console.error)
  }
  return (
    <AerospacePanel
      workspaces={workspaces}
      installed={status === null || status.aerospace.path !== null}
      onAction={onAction}
      onClose={onClose}
    />
  )
}
