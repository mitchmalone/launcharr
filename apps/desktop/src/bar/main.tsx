import {
  type AwakeStatus,
  endsLabel,
  formatSeconds,
  holdLabel,
  needsWatching,
  parseSpec,
} from '@launcharr/core/awake'
import {
  Bar,
  BarAgents,
  BarAwakeCard,
  BarAwakeCell,
  BarBatteryCell,
  BarClock,
  BarFrontApp,
  type BarSnapshot,
  BarTrmnlCell,
  BarWifiCell,
  BarWorkspaces,
  type BatteryDetail,
  formatBarClock,
} from '@launcharr/tui'
import '@launcharr/tui/bar.css'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'

import { awakeWatchTick, freshAwakeMemory } from '../lib/awake'
import {
  type BarZones,
  type Config,
  DEFAULT_BAR_LAYOUT,
  normalizeBarZones,
  notchedZones,
} from '../lib/config'
import { applyTheme } from '../lib/themes'
import './bar.css'
import { useBarHover } from './hover'

/**
 * The bar window: a thin container around `@launcharr/tui`'s bar components.
 *
 * Everything visual — the strip, cells, cards, CSS — lives in the kit, because
 * launcharr.com renders the same bar and the website may never hold a second
 * copy (AGENTS invariant 10). What stays here is everything the kit must not
 * know about: Rust snapshot delivery, `invoke` calls, `window.__notched`, and
 * config-driven zone resolution.
 */

declare global {
  interface Window {
    /** Rust pushes snapshots here via webview eval (see bar.rs push()). */
    __barPush?: (snap: BarSnapshot) => void
    /** Injected by bar.rs before page scripts: does this display carry a notch? */
    __notched?: boolean
  }
}

const NOTCHED = window.__notched === true

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

/** Battery detail is slow (spawns `ioreg` + `pmset`), so it is fetched on hover
 * only — never on the 1 Hz snapshot path. */
function useBatteryDetail(open: boolean): BatteryDetail | null {
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
  return open ? detail : null
}

/** The holders list is a `pmset` spawn — fetched on card-open only. */
function useAwakeStatus(open: boolean): AwakeStatus | null {
  const [status, setStatus] = useState<AwakeStatus | null>(null)
  useEffect(() => {
    if (!open) return
    let live = true
    invoke<AwakeStatus>('awake_status')
      .then((s) => live && setStatus(s))
      .catch(console.error)
    return () => {
      live = false
    }
  }, [open])
  return open ? status : null
}

function BarWindow() {
  const [snap, now, patch] = useSnapshot()
  const cfg = useBarConfig()
  // One owner of the Rust mouse feed for the whole bar — every hoverable cell
  // shares it (see hover.ts).
  const hover = useBarHover()
  const batteryDetail = useBatteryDetail(hover.hovered === 'battery')
  const awakeStatus = useAwakeStatus(hover.hovered === 'awake')

  // Primary awake-trigger watcher: evaluate on each Rust-pushed snapshot
  // while a conditional session is armed. Costs nothing when idle — the
  // gate below reads the snapshot the push already delivered.
  const awakeMem = useRef(freshAwakeMemory())
  useEffect(() => {
    const a = snap?.awake
    if (!a?.armed || !a.spec) {
      awakeMem.current = freshAwakeMemory()
      return
    }
    const spec = parseSpec(a.spec)
    if (!spec || !needsWatching(spec.until)) return
    awakeWatchTick(awakeMem.current).catch(console.error)
  }, [snap])

  const switchWorkspace = (ws: string) => {
    // Optimistic: highlight now, aerospace catches up off the main thread.
    patch((prev) => ({ ...prev, focused: ws }))
    invoke('bar_switch_workspace', { ws }).catch(console.error)
  }

  // Each widget as a node; order and toggles come from config (Settings →
  // Menubar), arranged into left/center/right zones.
  const moduleNode = (id: string): React.ReactNode => {
    if (!snap && id !== 'clock') return null
    switch (id) {
      case 'workspaces':
        return (
          <BarWorkspaces
            key={id}
            workspaces={snap!.workspaces}
            focused={snap!.focused}
            onSwitch={switchWorkspace}
          />
        )
      case 'agents':
        return (
          <BarAgents
            key={id}
            agents={
              cfg?.agents.showIdle === false
                ? snap!.agents.filter((a) => a.state !== 'idle')
                : snap!.agents
            }
            now={now}
            hover={hover}
            onJump={(session) =>
              invoke('agent_jump', { session }).catch(console.error)
            }
          />
        )
      case 'frontApp':
        return snap!.frontApp ? (
          <BarFrontApp key={id} name={snap!.frontApp} />
        ) : null
      case 'wifi':
        return (
          <BarWifiCell
            key={id}
            online={snap!.wifi.online}
            ssid={snap!.wifi.ssid}
          />
        )
      case 'trmnl':
        return snap!.trmnl ? (
          <BarTrmnlCell
            key={id}
            pct={snap!.trmnl.pct}
            name={snap!.trmnl.name}
          />
        ) : null
      case 'awake': {
        const a = snap!.awake
        const spec = a?.spec ? parseSpec(a.spec) : null
        const remaining =
          a?.untilEpochMs != null
            ? `${formatSeconds(
                Math.max(0, Math.round((a.untilEpochMs - Date.now()) / 1000)),
              )} left`
            : null
        return (
          <BarAwakeCell
            key={id}
            armed={a?.armed ?? false}
            timeLabel={remaining ?? formatSeconds(a?.elapsedSeconds ?? 0)}
            hover={hover}
            onRelease={() => invoke('awake_release').catch(console.error)}
            card={
              <BarAwakeCard
                armed={a?.armed ?? false}
                holdLabel={spec ? holdLabel(spec.screen, spec.disks) : null}
                endsLabel={
                  spec ? endsLabel(spec.until, a?.untilEpochMs ?? null) : null
                }
                elapsed={a?.armed ? formatSeconds(a.elapsedSeconds) : null}
                remaining={remaining}
                others={awakeStatus?.others ?? []}
                cardRef={hover.cardRef}
              />
            }
          />
        )
      }
      case 'battery':
        return (
          <BarBatteryCell
            key={id}
            pct={snap!.batteryPct}
            onAc={snap!.onAc}
            charging={snap!.charging}
            detail={batteryDetail}
            hover={hover}
            onClick={() =>
              invoke('open_path', { target: 'battery-settings' }).catch(
                console.error,
              )
            }
          />
        )
      case 'clock':
        return <BarClock key={id}>{formatBarClock(now)}</BarClock>
      default:
        return null
    }
  }

  // Zones are explicit (Settings → Menubar board); a notched display renders
  // no center zone — the camera housing owns it.
  const zones = displayZones(cfg)
  const render = (list: { id: string; enabled: boolean }[]) =>
    list.filter((m) => m.enabled).map((m) => moduleNode(m.id))
  return (
    <Bar
      left={render(zones.left)}
      center={NOTCHED ? undefined : render(zones.center).filter(Boolean)}
      right={render(zones.right)}
    />
  )
}

createRoot(document.getElementById('root')!).render(<BarWindow />)
