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

function useSnapshot(): [
  BarSnapshot | null,
  (update: (prev: BarSnapshot) => BarSnapshot) => void,
] {
  const [snap, setSnap] = useState<BarSnapshot | null>(null)
  useEffect(() => {
    let live = true
    const tick = () =>
      invoke<BarSnapshot>('bar_snapshot')
        .then((s) => {
          if (!live) return
          setSnap((prev) => ({
            ...s,
            // Sticky focus: a snapshot caught mid-switch reports none — keep
            // showing the last known workspace rather than blinking out.
            focused: s.focused ?? prev?.focused ?? null,
          }))
        })
        .catch(() => {})
    tick()
    const id = setInterval(tick, SNAPSHOT_MS)
    // Push path: aerospace (or any script) touches ~/.config/launcharr/
    // triggers/ and the backend emits this — polling is just the fallback.
    const un = listen('bar-refresh', tick)
    return () => {
      live = false
      clearInterval(id)
      un.then((f) => f())
    }
  }, [])
  const patch = (update: (prev: BarSnapshot) => BarSnapshot) =>
    setSnap((prev) => (prev ? update(prev) : prev))
  return [snap, patch]
}

function Bar() {
  const now = useClock()
  const [snap, patch] = useSnapshot()
  useBarTheme()

  const switchWorkspace = (ws: string) => {
    // Optimistic: highlight now, aerospace catches up off the main thread.
    patch((prev) => ({ ...prev, focused: ws }))
    invoke('bar_switch_workspace', { ws }).catch(console.error)
  }

  const clock = `${now.toLocaleDateString('en', { weekday: 'long' })} ${now
    .getHours()
    .toString()
    .padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`

  return (
    <div className="bar">
      <div className="bar-left">
        <span className="bar-logo">❯</span>
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
