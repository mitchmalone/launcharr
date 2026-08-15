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

declare global {
  interface Window {
    /** Rust pushes snapshots here via webview eval (see bar.rs push()). */
    __barPush?: (snap: BarSnapshot) => void
  }
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

/**
 * The webview is a pure listener — no JS timers. WKWebView throttles timers in
 * never-focused windows (the bar went stale/blank); Rust pushes a snapshot
 * every second and on trigger events, and event delivery isn't throttled.
 * The clock rides the same 1 Hz push.
 */
function useSnapshot(): [
  BarSnapshot | null,
  Date,
  (update: (prev: BarSnapshot) => BarSnapshot) => void,
] {
  const [snap, setSnap] = useState<BarSnapshot | null>(null)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let live = true
    const absorb = (s: BarSnapshot) => {
      if (!live) return
      // Temporary diagnostics (2026-08-16 focus hunt). domFocused shows the
      // PREVIOUS render's DOM — if it tracks pushes, React is applying state
      // and any visual staleness is a compositing problem.
      invoke('bar_debug', {
        msg: `absorb focused=${s.focused} domFocused=${
          document.querySelector('.bar-ws-focused')?.textContent ?? 'none'
        } clock=${document.querySelector('.bar-center')?.textContent ?? '?'}`,
      }).catch(() => {})
      setNow(new Date())
      setSnap((prev) => ({
        ...s,
        // Sticky focus: a snapshot caught mid-switch reports none — keep
        // showing the last known workspace rather than blinking out.
        focused: s.focused ?? prev?.focused ?? null,
      }))
    }
    // One pull for first paint; everything after arrives by Rust eval-push.
    invoke<BarSnapshot>('bar_snapshot').then(absorb).catch(console.error)
    window.__barPush = absorb
    return () => {
      live = false
      delete window.__barPush
    }
  }, [])
  const patch = (update: (prev: BarSnapshot) => BarSnapshot) =>
    setSnap((prev) => (prev ? update(prev) : prev))
  return [snap, now, patch]
}

function Bar() {
  const [snap, now, patch] = useSnapshot()
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
