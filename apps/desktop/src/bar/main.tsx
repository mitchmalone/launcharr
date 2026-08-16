import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import {
  BatteryCharging,
  BatteryFull,
  BatteryLow,
  BatteryMedium,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'

import { type Config, normalizeBarModules } from '../lib/config'
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

/** Lucide icons in bar cells, sized to the 12px monospace strip. Custom
 * Lucide-style brand icons (24×24 viewBox, 2px stroke) take the same props. */
const ICON_PROPS = {
  size: 14,
  strokeWidth: 2.2,
  'aria-hidden': true,
} as const

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
  const idleTimer = useRef<number | null>(null)
  useEffect(
    () => () => {
      delete window.__barMouse
      if (closeTimer.current != null) clearTimeout(closeTimer.current)
      if (idleTimer.current != null) clearTimeout(idleTimer.current)
    },
    [],
  )

  const cancelClose = () => {
    if (closeTimer.current != null) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }
  const close = () => {
    cancelClose()
    if (idleTimer.current != null) clearTimeout(idleTimer.current)
    setHoveredId(null)
    invoke('bar_set_dropdown', { open: false }).catch(console.error)
  }
  // Fail-safe: if the Rust mouse feed ever stalls, a card with no activity
  // for 10s closes itself rather than stranding the dropdown open.
  const armIdleClose = () => {
    if (idleTimer.current != null) clearTimeout(idleTimer.current)
    idleTimer.current = window.setTimeout(close, 10_000)
  }
  const openFor = (id: string) => {
    cancelClose()
    armIdleClose()
    if (hoveredId === null) {
      invoke('bar_set_dropdown', { open: true }).catch(console.error)
    }
    setHoveredId(id)
  }
  // Delayed close bridges the pixel gap between the strip and the card.
  // Arm-once, not reset: the mouse feed repeats while the cursor is outside,
  // and re-arming on every tick would keep the deadline forever in the future.
  const scheduleClose = () => {
    if (closeTimer.current != null) return
    closeTimer.current = window.setTimeout(close, 200)
  }

  // Hover arrives from Rust, not AppKit: WebKit won't process hover for a
  // never-active accessory window (JOURNAL 2026-08-16), so bar.rs polls the
  // global cursor and feeds window-local coordinates here. (-1,-1) = left.
  window.__barMouse = (x: number, y: number) => {
    if (x < 0) {
      if (hoveredId !== null) scheduleClose()
      return
    }
    const el = document.elementFromPoint(x, y)
    const cell = el?.closest('.bar-agent') as HTMLElement | null
    if (cell?.dataset.session) {
      if (cell.dataset.session !== hoveredId) openFor(cell.dataset.session)
      else {
        cancelClose()
        armIdleClose()
      }
      return
    }
    if (hoveredId === null) return
    if (el?.closest('.bar-agent-card')) {
      cancelClose()
      armIdleClose()
    } else {
      scheduleClose()
    }
  }

  if (agents.length === 0) return null

  const { groups, loose } = groupAgents(agents)
  const hovered = agents.find((a) => a.session === hoveredId) ?? null
  const cell = (a: AgentSession) => (
    <button
      key={a.session}
      type="button"
      data-session={a.session}
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
      onMouseMove={hoveredId !== null ? armIdleClose : undefined}
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
    /** Rust-fed cursor position in CSS px; (-1,-1) = left the bar region. */
    __barMouse?: (x: number, y: number) => void
  }
}

/** The bar wears the panel theme and renders module order/toggles from
 * config, following edits live. */
function useBarConfig(): Config | null {
  const [cfg, setCfg] = useState<Config | null>(null)
  useEffect(() => {
    const apply = (c: Config) => {
      applyTheme(c.theme, c.themes, 'panel')
      setCfg(c)
    }
    invoke<Config>('read_config').then(apply).catch(console.error)
    const un = listen<Config>('config-changed', (e) => apply(e.payload))
    return () => {
      un.then((f) => f())
    }
  }, [])
  return cfg
}

/** Injected by bar.rs before page scripts: does this display carry a notch? */
declare global {
  interface Window {
    __notched?: boolean
  }
}
const NOTCHED = window.__notched === true

/** This display's module list: the notched arrangement when present and this
 * bar sits under a notch, else the main one — normalized like config.rs. */
function normalizeModules(
  cfg: Config | null,
): { id: string; enabled: boolean }[] {
  const list =
    (NOTCHED ? cfg?.bar.notchedModules : null) ?? cfg?.bar.modules ?? []
  return normalizeBarModules(list)
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
  const cfg = useBarConfig()

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

  // Each widget as a node; order and toggles come from config (Settings →
  // Menubar), with `clock` splitting left from right.
  const moduleNode = (id: string): React.ReactNode => {
    switch (id) {
      case 'workspaces':
        return (
          snap &&
          snap.workspaces.length > 0 && (
            <div key={id} className="bar-ws-cluster">
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
          )
        )
      case 'agents':
        return (
          snap && (
            <AgentCluster
              key={id}
              agents={
                cfg?.agents.showIdle === false
                  ? snap.agents.filter((a) => a.state !== 'idle')
                  : snap.agents
              }
              now={now}
            />
          )
        )
      case 'frontApp':
        return (
          snap?.frontApp && (
            <span key={id} className="bar-app">
              {snap.frontApp}
            </span>
          )
        )
      case 'wifi':
        return (
          snap && (
            <span
              key={id}
              className={`bar-cell ${snap.wifi.online ? '' : 'bar-danger'}`}
              title={snap.wifi.ssid ?? undefined}
            >
              {snap.wifi.online ? (
                <Wifi {...ICON_PROPS} />
              ) : (
                <WifiOff {...ICON_PROPS} />
              )}
              {snap.wifi.online ? (snap.wifi.ssid ?? 'SSID hidden') : 'Offline'}
            </span>
          )
        )
      case 'trmnl':
        return (
          snap?.trmnl && (
            <span
              key={id}
              className={trmnlClass}
              title={snap.trmnl.name ?? 'TRMNL'}
            >
              ▣ {snap.trmnl.pct != null ? `${snap.trmnl.pct}%` : '--'}
            </span>
          )
        )
      case 'battery': {
        if (snap?.batteryPct == null) {
          return (
            snap?.onAc && (
              <span key={id} className="bar-cell">
                <BatteryCharging {...ICON_PROPS} />
                AC
              </span>
            )
          )
        }
        const BatteryIcon =
          snap.charging || snap.onAc
            ? BatteryCharging
            : snap.batteryPct >= 75
              ? BatteryFull
              : snap.batteryPct >= 35
                ? BatteryMedium
                : BatteryLow
        return (
          <span key={id} className={batteryClass}>
            <BatteryIcon {...ICON_PROPS} />
            {snap.batteryPct}%
          </span>
        )
      }
      default:
        return null
    }
  }

  const modules = normalizeModules(cfg)
  const clockIdx = modules.findIndex((m) => m.id === 'clock')
  const enabled = (list: { id: string; enabled: boolean }[]) =>
    list.filter((m) => m.enabled).map((m) => moduleNode(m.id))
  const left = enabled(clockIdx < 0 ? modules : modules.slice(0, clockIdx))
  const right = enabled(clockIdx < 0 ? [] : modules.slice(clockIdx + 1))
  const showClock = clockIdx >= 0 && (modules[clockIdx]?.enabled ?? false)

  // Under a notch the absolute center is the camera housing — the clock joins
  // the head of the right cluster instead of anchoring the middle.
  return (
    <div className="bar">
      <div className="bar-left">
        <span className="bar-logo">❯</span>
        {left}
      </div>
      {showClock && !NOTCHED && <div className="bar-center">{clock}</div>}
      <div className="bar-right">
        {showClock && NOTCHED && <span className="bar-clock">{clock}</span>}
        {right}
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Bar />)
