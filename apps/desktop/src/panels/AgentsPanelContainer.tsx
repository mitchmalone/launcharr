import { invoke } from '@tauri-apps/api/core'
import { useEffect, useState } from 'react'

import { type AgentSession, AgentsPanel } from './AgentsPanel'

const REFRESH_MS = 1000

/**
 * Wires AgentsPanel to agents_status/agent_jump. A JS interval is safe here —
 * panels only exist inside the key launcher window, which WebKit never
 * background-throttles (contrast: the bar, JOURNAL 2026-08-16).
 */
export function AgentsPanelContainer({ onClose }: { onClose: () => void }) {
  const [sessions, setSessions] = useState<AgentSession[]>([])
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))

  useEffect(() => {
    const refresh = () => {
      invoke<AgentSession[]>('agents_status')
        .then((s) => {
          setSessions(s)
          setNow(Math.floor(Date.now() / 1000))
        })
        .catch(console.error)
    }
    refresh()
    const id = setInterval(refresh, REFRESH_MS)
    return () => clearInterval(id)
  }, [])

  // Always invoke — visiting marks a done session read even when it has no
  // pane to land in (the backend errors on the missing pane after the read).
  const onJump = (session: AgentSession) => {
    invoke('agent_jump', { session: session.session })
      .then(onClose)
      .catch(console.error)
  }

  // Optimistic: the row goes now, the backend confirms. A dismiss the user
  // has to watch for a second isn't an escape hatch.
  const onDismiss = (session: AgentSession) => {
    setSessions((current) =>
      current.filter((s) => s.session !== session.session),
    )
    invoke('agent_forget', { session: session.session }).catch(console.error)
  }

  return (
    <AgentsPanel
      sessions={sessions}
      nowSecs={now}
      onJump={onJump}
      onDismiss={onDismiss}
      onClose={onClose}
    />
  )
}
