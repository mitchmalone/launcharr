import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'

import type { Config } from '../lib/config'
import { applyTheme } from '../lib/themes'
import './bar.css'

/** Mirrors AgentSession in agents.rs. */
interface AgentSession {
  session: string
  agent: string
  state: string
  title: string
  detail: string
  tmux: string
  updatedAt: number
  tmuxSession: string | null
  tmuxWindow: number | null
  tmuxWindowName: string | null
}

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
  agents: AgentSession[]
}

const AGENT_GLYPHS: Record<string, string> = {
  working: '●',
  attention: '◉',
  done: '●',
  idle: '○',
}

/** User-facing state names where the wire name reads wrong. */
const AGENT_STATE_LABELS: Record<string, string> = {
  attention: 'blocked',
  done: 'done · unread',
}

function agentAge(updatedAt: number, now: Date): string {
  const s = Math.max(0, Math.floor(now.getTime() / 1000) - updatedAt)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.round(s / 60)}m`
  return `${Math.round(s / 3600)}h`
}

/**
 * tmux-session groups (ordered by name, cells by tab index) plus loose cells
 * for agents outside tmux — invocation order never decides placement.
 */
function groupAgents(agents: AgentSession[]) {
  const byName = new Map<string, AgentSession[]>()
  const loose: AgentSession[] = []
  for (const a of agents) {
    if (a.tmuxSession) {
      const list = byName.get(a.tmuxSession) ?? []
      list.push(a)
      byName.set(a.tmuxSession, list)
    } else {
      loose.push(a)
    }
  }
  for (const list of byName.values()) {
    list.sort(
      (x, y) =>
        (x.tmuxWindow ?? 0) - (y.tmuxWindow ?? 0) ||
        x.session.localeCompare(y.session),
    )
  }
  loose.sort((x, y) => x.session.localeCompare(y.session))
  const groups = [...byName.entries()].sort(([a], [b]) => a.localeCompare(b))
  return { groups, loose }
}

/**
 * Agent session cells, replacing the retired sketchybar emoji widgets: one
 * glyph per session, boxed by tmux session and ordered by tab. Hovering opens
 * a dropdown card — the window itself grows downward via bar_set_dropdown,
 * since a 30px strip can't host a popover — with the agent's task, state, and
 * tmux location. Click jumps to the pane and marks a done session read.
 */
function AgentCluster({ agents, now }: { agents: AgentSession[]; now: Date }) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const closeTimer = useRef<number | null>(null)
  useEffect(
    () => () => {
      if (closeTimer.current != null) clearTimeout(closeTimer.current)
    },
    [],
  )
  if (agents.length === 0) return null

  const cancelClose = () => {
    if (closeTimer.current != null) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }
  const openFor = (id: string) => {
    cancelClose()
    if (hoveredId === null) {
      invoke('bar_set_dropdown', { open: true }).catch(console.error)
    }
    setHoveredId(id)
  }
  // Delayed close bridges the pixel gap between the strip and the card.
  const scheduleClose = () => {
    cancelClose()
    closeTimer.current = window.setTimeout(() => {
      setHoveredId(null)
      invoke('bar_set_dropdown', { open: false }).catch(console.error)
    }, 200)
  }

  const { groups, loose } = groupAgents(agents)
  const hovered = agents.find((a) => a.session === hoveredId) ?? null
  const cell = (a: AgentSession) => (
    <button
      key={a.session}
      type="button"
      className={`bar-agent bar-agent-${a.state}`}
      onMouseEnter={() => openFor(a.session)}
      onClick={() =>
        invoke('agent_jump', { session: a.session }).catch(console.error)
      }
    >
      {AGENT_GLYPHS[a.state] ?? '○'}
    </button>
  )

  return (
    <div
      className="bar-agents"
      onMouseEnter={cancelClose}
      onMouseLeave={scheduleClose}
    >
      {groups.map(([name, list]) => (
        <div key={name} className="bar-agent-group">
          {list.map(cell)}
        </div>
      ))}
      {loose.map(cell)}
      {hovered && (
        <div className="bar-agent-card">
          <div className="bar-agent-card-title">
            {hovered.title || hovered.agent}
          </div>
          <div className={`bar-agent-card-state bar-agent-${hovered.state}`}>
            {AGENT_GLYPHS[hovered.state] ?? '○'}{' '}
            {AGENT_STATE_LABELS[hovered.state] ?? hovered.state} ·{' '}
            {agentAge(hovered.updatedAt, now)} ago
          </div>
          {hovered.detail && (
            <div className="bar-agent-card-line">{hovered.detail}</div>
          )}
          <div className="bar-agent-card-line">
            {hovered.tmuxSession
              ? `${hovered.tmuxSession} · tab ${hovered.tmuxWindow}` +
                (hovered.tmuxWindowName ? ` · ${hovered.tmuxWindowName}` : '')
              : 'no tmux pane'}
          </div>
          <div className="bar-agent-card-hint">click cell to jump</div>
        </div>
      )}
    </div>
  )
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
        {snap && <AgentCluster agents={snap.agents} now={now} />}
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
