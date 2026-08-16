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
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

import {
  type BarZones,
  type Config,
  DEFAULT_BAR_LAYOUT,
  normalizeBarZones,
  notchedZones,
} from '../lib/config'
import { applyTheme } from '../lib/themes'
import './bar.css'
import { type BarHover, useBarHover } from './hover'

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

/** Growth the agent card needs while open (see useBarHover). */
const AGENT_CARD_HEIGHT = 130

/**
 * Agent session cells, replacing the retired sketchybar emoji widgets: one
 * glyph per session, boxed by tmux session and ordered by tab. Hovering opens
 * a dropdown card — the window itself grows downward via bar_set_dropdown,
 * since a 30px strip can't host a popover — with the agent's task, state, and
 * tmux location. Click jumps to the pane and marks a done session read.
 */
function AgentCluster({
  agents,
  now,
  hover,
}: {
  agents: AgentSession[]
  now: Date
  hover: BarHover
}) {
  if (agents.length === 0) return null

  const { groups, loose } = groupAgents(agents)
  const hoveredId = hover.hovered?.startsWith('agent:')
    ? hover.hovered.slice('agent:'.length)
    : null
  const hovered = agents.find((a) => a.session === hoveredId) ?? null
  const cell = (a: AgentSession) => (
    <button
      key={a.session}
      type="button"
      data-hover={`agent:${a.session}`}
      data-hover-height={AGENT_CARD_HEIGHT}
      className={`bar-agent bar-agent-${a.state}`}
      onMouseEnter={() => hover.enter(`agent:${a.session}`, AGENT_CARD_HEIGHT)}
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
      onMouseEnter={hover.stay}
      onMouseLeave={hover.leave}
    >
      {groups.map(([name, list]) => (
        <div key={name} className="bar-agent-group">
          {list.map(cell)}
        </div>
      ))}
      {loose.map(cell)}
      {hovered && (
        <div className="bar-card bar-agent-card" ref={hover.cardRef}>
          <div className="bar-card-title">{hovered.title || hovered.agent}</div>
          <div className={`bar-card-line bar-agent-${hovered.state}`}>
            {AGENT_GLYPHS[hovered.state] ?? '○'}{' '}
            {AGENT_STATE_LABELS[hovered.state] ?? hovered.state} ·{' '}
            {agentAge(hovered.updatedAt, now)} ago
          </div>
          {hovered.detail && (
            <div className="bar-card-line bar-card-dim">{hovered.detail}</div>
          )}
          <div className="bar-card-line bar-card-dim">
            {hovered.tmuxSession
              ? `${hovered.tmuxSession} · tab ${hovered.tmuxWindow}` +
                (hovered.tmuxWindowName ? ` · ${hovered.tmuxWindowName}` : '')
              : 'no tmux pane'}
          </div>
          <div className="bar-card-hint">click cell to jump</div>
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

/** Mirrors BatteryDetail in battery.rs — every field optional by design. */
interface BatteryDetail {
  pct: number | null
  onAc: boolean
  charging: boolean
  fullyCharged: boolean
  cycleCount: number | null
  capacityWh: number | null
  designWh: number | null
  healthPct: number | null
  minutesRemaining: number | null
  batteryWatts: number | null
  systemWatts: number | null
  powerMode: 'low' | 'automatic' | 'high' | null
}

const BATTERY_CARD_HEIGHT = 250

const POWER_MODES: [BatteryDetail['powerMode'], string][] = [
  ['low', 'Low power'],
  ['automatic', 'Automatic'],
  ['high', 'High power'],
]

/** "4h 58m" / "58m" — the same shape macOS puts in its own battery menu. */
function timeLeft(minutes: number): string {
  const h = Math.floor(minutes / 60)
  return h > 0 ? `${h}h ${minutes % 60}m` : `${minutes}m`
}

/** The lead line under "Battery": what the pack is doing right now. */
function batteryState(d: BatteryDetail): string {
  if (d.charging) return 'charging'
  if (d.onAc) return d.fullyCharged ? 'charged' : 'AC attached · not charging'
  return 'discharging'
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="bar-card-dim">{label}</span>
      <span className="bar-battery-value">{value}</span>
    </>
  )
}

/**
 * The battery cell and its hover card: the strip shows percent, the card the
 * facts that don't fit — capacity, time left, cycles, draw, health, and the
 * active power mode. Power mode is read-only (setting it needs admin auth,
 * which the zero-permissions invariant won't spend); the click opens System
 * Settings → Battery instead. Detail is fetched on hover only, never on the
 * 1 Hz snapshot path.
 */
function BatteryCell({
  snap,
  className,
  hover,
}: {
  snap: BarSnapshot
  className: string
  hover: BarHover
}) {
  const open = hover.hovered === 'battery'
  const [detail, setDetail] = useState<BatteryDetail | null>(null)
  useEffect(() => {
    if (!open) return
    let live = true
    invoke<BatteryDetail>('bar_battery_detail')
      .then((d) => live && setDetail(d))
      .catch(console.error)
    return () => {
      live = false
    }
  }, [open])

  if (snap.batteryPct == null) {
    // Desktop Mac: no pack to report on, so no card either.
    return snap.onAc ? (
      <span className="bar-cell">
        <BatteryCharging {...ICON_PROPS} />
        AC
      </span>
    ) : null
  }
  const Icon =
    snap.charging || snap.onAc
      ? BatteryCharging
      : snap.batteryPct >= 75
        ? BatteryFull
        : snap.batteryPct >= 35
          ? BatteryMedium
          : BatteryLow
  // The card leans on the live snapshot for percent/state so it never lags the
  // strip it hangs from; only the slow facts come from the detail fetch.
  const d: BatteryDetail | null = detail && {
    ...detail,
    pct: snap.batteryPct,
    onAc: snap.onAc,
    charging: snap.charging,
  }
  const watts = d?.charging || !d?.onAc ? d?.batteryWatts : d?.systemWatts
  return (
    <span className="bar-battery">
      <button
        type="button"
        data-hover="battery"
        data-hover-height={BATTERY_CARD_HEIGHT}
        className={className}
        onMouseEnter={() => hover.enter('battery', BATTERY_CARD_HEIGHT)}
        onClick={() =>
          invoke('open_path', { target: 'battery-settings' }).catch(
            console.error,
          )
        }
      >
        <Icon {...ICON_PROPS} />
        {snap.batteryPct}%
      </button>
      {open && d && (
        <div className="bar-card bar-battery-card" ref={hover.cardRef}>
          <div className="bar-battery-head">
            <Icon size={20} strokeWidth={2.2} aria-hidden />
            <div>
              <div className="bar-card-title">Battery</div>
              <div className="bar-card-dim bar-battery-state">
                {batteryState(d)}
              </div>
            </div>
            <div className="bar-battery-pct">{d.pct}%</div>
          </div>
          <div className="bar-battery-track">
            <div
              className={`bar-battery-fill ${className.includes('bar-danger') ? 'bar-battery-fill-low' : ''}`}
              style={{ width: `${d.pct ?? 0}%` }}
            />
          </div>
          <div className="bar-battery-grid">
            {d.capacityWh != null && (
              <Stat
                label="Battery size"
                value={`${Math.round(d.capacityWh)}Wh`}
              />
            )}
            {d.minutesRemaining != null && (
              <Stat
                label={d.charging ? 'Time to full' : 'Time left'}
                value={timeLeft(d.minutesRemaining)}
              />
            )}
            {d.cycleCount != null && (
              <Stat label="Charge cycles" value={`${d.cycleCount}`} />
            )}
            {watts != null && watts !== 0 && (
              <Stat
                label={
                  d.charging
                    ? 'Charging'
                    : d.onAc
                      ? 'System draw'
                      : 'Discharging'
                }
                value={`${Math.abs(watts).toFixed(1)}W`}
              />
            )}
            {d.healthPct != null && (
              <Stat label="Health" value={`${d.healthPct}%`} />
            )}
          </div>
          {d.powerMode && (
            <>
              <div className="bar-card-section">Power profile</div>
              <div className="bar-battery-modes">
                {POWER_MODES.map(([mode, label]) => (
                  <span
                    key={label}
                    className={`bar-battery-mode ${mode === d.powerMode ? 'bar-battery-mode-on' : ''}`}
                  >
                    {label}
                  </span>
                ))}
              </div>
            </>
          )}
          <div className="bar-card-hint">click cell for Battery settings</div>
        </div>
      )}
    </span>
  )
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

/** This display's zones: the notched arrangement (explicit or derived) when
 * this bar sits under a notch, else the main layout — normalized. */
function displayZones(cfg: Config | null): BarZones {
  const bar = cfg?.bar ?? { enabled: false, layout: DEFAULT_BAR_LAYOUT }
  return NOTCHED ? notchedZones(bar) : normalizeBarZones(bar.layout)
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
  // One owner of the Rust mouse feed for the whole bar — every hoverable cell
  // shares it (see hover.ts).
  const hover = useBarHover()

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
              hover={hover}
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
      case 'battery':
        return (
          snap && (
            <BatteryCell
              key={id}
              snap={snap}
              className={batteryClass}
              hover={hover}
            />
          )
        )
      case 'clock':
        return (
          <span key={id} className="bar-clock">
            {clock}
          </span>
        )
      default:
        return null
    }
  }

  // Zones are explicit (Settings → Menubar board); a notched display renders
  // no center zone — the camera housing owns it.
  const zones = displayZones(cfg)
  const render = (list: { id: string; enabled: boolean }[]) =>
    list.filter((m) => m.enabled).map((m) => moduleNode(m.id))
  const center = render(zones.center)
  return (
    <div className="bar">
      <div className="bar-left">
        <span className="bar-logo">❯</span>
        {render(zones.left)}
      </div>
      {!NOTCHED && center.length > 0 && (
        <div className="bar-center">{center}</div>
      )}
      <div className="bar-right">{render(zones.right)}</div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Bar />)
