/**
 * The bar's data contract. These shapes mirror what the desktop app's Rust side
 * pushes (agents.rs, battery.rs, bar.rs); the website feeds the same shapes with
 * fictional values, so both consumers render from one set of components.
 */

/** Mirrors AgentSession in agents.rs. */
export interface AgentSession {
  session: string
  agent: string
  state: string
  title: string
  detail: string
  /** Which multiplexer the agent lives in: 'tmux' | 'herdr' | '' for neither. */
  mux: string
  /** Pane id inside it: '%12' (tmux), 'w1:p1' (herdr). */
  muxTarget: string
  updatedAt: number
  /** tmux session / herdr workspace — the box a cell is grouped into. */
  muxGroup: string | null
  /** tmux window index / herdr tab number. */
  muxIndex: number | null
  /** tmux window name / herdr tab label. */
  muxLabel: string | null
  /** The agent process, when its adapter reports one — liveness, not display. */
  pid: number | null
  pidComm: string | null
  /** Subagents forked and still running — shown in the parent's card, never as cells. */
  subagents: Subagent[]
}

/** Mirrors Subagent in agents.rs. */
export interface Subagent {
  id: string
  /** The agent type: 'Explore', 'general-purpose', a custom name. */
  kind: string
  description: string
  startedAt: number
}

/** What the wifi hover card shows — mirrors WifiStatus in wifi.rs (the same
 * command feeds `wifi ⏎` and `dns ⏎`); fetched by the consumer on hover only. */
export interface WifiDetail {
  iface: string | null
  online: boolean
  ssid: string | null
  ip: string | null
  router: string | null
  dns: string | null
}

/** Mirrors BatteryDetail in battery.rs — every field optional by design. */
export interface BatteryDetail {
  pct: number | null
  onAc: boolean
  charging: boolean
  fullyCharged: boolean
  /** The user's charge limit (e.g. 80) when one is set. */
  chargeLimit: number | null
  cycleCount: number | null
  capacityWh: number | null
  designWh: number | null
  healthPct: number | null
  minutesRemaining: number | null
  batteryWatts: number | null
  systemWatts: number | null
  powerMode: 'low' | 'automatic' | 'high' | null
}

/** Mirrors AwakeState in power.rs — the keep-awake session as the bar sees it. */
export interface AwakeBarState {
  armed: boolean
  display: boolean
  disks: boolean
  elapsedSeconds: number
  untilEpochMs: number | null
  batteryFloor: number | null
  /** Serialized AwakeSpec (@launcharr/core/awake), stored verbatim by Rust. */
  spec: string | null
  /** Why the last session ended on its own ("deadline" | "floor"). */
  released: string | null
  /** Re-armed at launch from the previous run's persisted hold. */
  resumed: boolean
}

/** Another process keeping the Mac awake (mirrors OtherHolder in power.rs). */
export interface AwakeHolder {
  app: string
  seconds: number
  display: boolean
}

/* ---- widgets (docs/WIDGETS.md) --------------------------------------- */

/** The scripts action vocabulary (mirrors ScriptAction in scripts.rs). */
export type WidgetAction =
  | { type: 'open'; value: string }
  | { type: 'copy'; value: string }
  | { type: 'none' }

/** Cell and dot tones a widget may ask for; anything else renders plain. */
export type WidgetTone = 'ok' | 'warn' | 'error' | 'muted' | 'accent'

/** Mirrors WidgetRow in widgets.rs — one line of a widget's card. */
export interface WidgetRow {
  dot?: WidgetTone | string | null
  text: string
  hint?: string | null
  action?: WidgetAction | null
}

/** Mirrors WidgetCard in widgets.rs. */
export interface WidgetCard {
  title?: string | null
  subtitle?: string | null
  rows?: WidgetRow[]
  hint?: string | null
}

/** Mirrors WidgetView in widgets.rs — what one successful tick painted. */
export interface WidgetView {
  /** No cell this tick (a credentialed widget without its credential). */
  hidden?: boolean
  /** lucide icon name (kebab-case). */
  icon?: string | null
  label?: string | null
  tone?: WidgetTone | string | null
  click?: WidgetAction | null
  card?: WidgetCard | null
}

/** Mirrors WidgetSetting in widgets.rs — one setting a manifest declares. */
export interface WidgetSetting {
  /** Env-var name the widget reads. */
  key: string
  label: string
  hint?: string | null
  /** Keychain-stored; the UI only ever learns whether it's set. */
  secret?: boolean
  /** Unset → the widget isn't run ("needs setup"). */
  required?: boolean
}

/** Mirrors WidgetAuth in widgets.rs — the widget answers `auth`. */
export interface WidgetAuth {
  label: string
}

/** Mirrors WidgetState in widgets.rs — a user widget as the bar sees it. */
export interface BarWidget {
  id: string
  name: string
  zone: string
  /** Manifest icon: the glyph before the first tick. */
  icon: string | null
  /** Last successful tick; kept through failures. */
  view: WidgetView | null
  /** Why the last tick failed; null while healthy. */
  error: string | null
  /** Epoch seconds. */
  lastOk: number | null
  updatedAt: number | null
  /** Declared settings (manifest) and whether the widget owns a sign-in. */
  settings?: WidgetSetting[]
  auth?: WidgetAuth | null
  /** Required settings still unset — the widget isn't ticked while non-empty. */
  needs?: string[]
}

/** One 1 Hz push from bar.rs. */
export interface BarSnapshot {
  workspaces: string[]
  focused: string | null
  frontApp: string | null
  batteryPct: number | null
  onAc: boolean
  charging: boolean
  chargeLimit: number | null
  wifi: { online: boolean; ssid: string | null; rssi: number | null }
  agents: AgentSession[]
  /** Optional so fixtures without a keep-awake session stay valid. */
  awake?: AwakeBarState | null
  /** User widgets (widgets.rs); optional so older fixtures stay valid. */
  widgets?: BarWidget[]
}

/**
 * How a cell talks to whatever owns hover for its consumer. The desktop app's
 * `useBarHover` gets cursor positions polled from Rust (WebKit won't deliver
 * hover to a never-active accessory window); a browser has real pointer events.
 * Only this interface is shared — each consumer keeps its own feed, and the kit
 * stays presentational with no environment assumptions.
 */
export interface BarHoverApi {
  /** `data-hover` id of the cell whose card is open, if any. */
  hovered: string | null
  enter: (id: string, height: number) => void
  leave: () => void
  stay: () => void
  /** `ref` for a card's root — lets a consumer size a window to it. */
  cardRef: (el: HTMLElement | null) => void
}

/** A module's placement, as `bar.layout` records it. Resolution of zones
 * (notch profiles, legacy migration) is config semantics and stays in the app;
 * the kit only renders what it's handed. */
export interface BarModule {
  id: string
  enabled: boolean
}

export interface BarZones {
  left: BarModule[]
  center: BarModule[]
  right: BarModule[]
}
