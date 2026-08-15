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
  charging: boolean
  wifi: { online: boolean; ssid: string | null }
  /** null → no TRMNL token, cell hidden; pct null → API error state. */
  trmnl: { pct: number | null; name: string | null } | null
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

  // Sketchybar parity: "Sat 16 Aug 07:45".
  const clock = `${now
    .toLocaleDateString('en-AU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    })
    .replace(',', '')} ${now.getHours().toString().padStart(2, '0')}:${now
    .getMinutes()
    .toString()
    .padStart(2, '0')}`

  const batteryClass = snap?.charging
    ? 'bar-cell'
    : snap?.batteryPct != null && snap.batteryPct < 20 && !snap.onAc
      ? 'bar-cell bar-danger'
      : snap?.batteryPct != null && snap.batteryPct < 50 && !snap.onAc
        ? 'bar-cell bar-warn'
        : 'bar-cell'

  const trmnlClass =
    snap?.trmnl?.pct == null
      ? 'bar-cell bar-danger'
      : snap.trmnl.pct < 20
        ? 'bar-cell bar-danger'
        : snap.trmnl.pct <= 40
          ? 'bar-cell bar-warn'
          : 'bar-cell'

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
        {snap && (
          <span
            className={`bar-cell ${snap.wifi.online ? '' : 'bar-danger'}`}
            title={snap.wifi.ssid ?? undefined}
          >
            {snap.wifi.online
              ? `◠ ${snap.wifi.ssid ?? 'SSID hidden'}`
              : '◠ Offline'}
          </span>
        )}
        {snap?.trmnl && (
          <span className={trmnlClass} title={snap.trmnl.name ?? 'TRMNL'}>
            ▣ {snap.trmnl.pct != null ? `${snap.trmnl.pct}%` : '--'}
          </span>
        )}
        {snap?.batteryPct != null ? (
          <span className={batteryClass}>
            {snap.charging || snap.onAc ? '↯' : '▮'} {snap.batteryPct}%
          </span>
        ) : (
          snap?.onAc && <span className="bar-cell">↯ AC</span>
        )}
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Bar />)
