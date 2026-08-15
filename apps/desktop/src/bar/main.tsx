import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

import type { Config } from '../lib/config'
import { applyTheme } from '../lib/themes'
import './bar.css'

interface BarSnapshot {
  workspaces: string[]
  focused: string | null
  frontApp: string | null
  batteryPct: number | null
  onAc: boolean
}

const SNAPSHOT_MS = 1000

function useClock(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

/** The bar wears the panel theme and follows config edits live. */
function useBarTheme() {
  useEffect(() => {
    const apply = (cfg: Config) => applyTheme(cfg.theme, cfg.themes, 'panel')
    invoke<Config>('read_config').then(apply).catch(console.error)
    const un = listen<Config>('config-changed', (e) => apply(e.payload))
    return () => {
      un.then((f) => f())
    }
  }, [])
}

function useSnapshot(): [BarSnapshot | null, () => void] {
  const [snap, setSnap] = useState<BarSnapshot | null>(null)
  const [nonce, setNonce] = useState(0)
  useEffect(() => {
    let live = true
    const tick = () =>
      invoke<BarSnapshot>('bar_snapshot')
        .then((s) => live && setSnap(s))
        .catch(() => {})
    tick()
    const id = setInterval(tick, SNAPSHOT_MS)
    return () => {
      live = false
      clearInterval(id)
    }
  }, [nonce])
  return [snap, () => setNonce((n) => n + 1)]
}

function Bar() {
  const now = useClock()
  const [snap, refresh] = useSnapshot()
  useBarTheme()

  const switchWorkspace = (ws: string) => {
    invoke('bar_switch_workspace', { ws }).then(refresh).catch(console.error)
  }

  const clock = `${now.toLocaleDateString('en', { weekday: 'long' })} ${now
    .getHours()
    .toString()
    .padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`

  return (
    <div className="bar">
      <div className="bar-left">
        {snap && snap.workspaces.length > 0 && (
          <div className="bar-ws-cluster">
            {snap.workspaces.map((ws) => (
              <button
                key={ws}
                type="button"
                className={`bar-ws ${ws === snap.focused ? 'bar-ws-focused' : ''}`}
                onClick={() => switchWorkspace(ws)}
              >
                {ws}
              </button>
            ))}
          </div>
        )}
        {snap?.frontApp && <span className="bar-app">{snap.frontApp}</span>}
      </div>
      <div className="bar-center">{clock}</div>
      <div className="bar-right">
        {snap?.batteryPct != null && (
          <span className="bar-cell">
            {snap.onAc ? '↯' : '▮'} {snap.batteryPct}%
          </span>
        )}
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Bar />)
