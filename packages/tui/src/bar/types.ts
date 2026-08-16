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
  tmux: string
  updatedAt: number
  tmuxSession: string | null
  tmuxWindow: number | null
  tmuxWindowName: string | null
}

/** Mirrors BatteryDetail in battery.rs — every field optional by design. */
export interface BatteryDetail {
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

/** One 1 Hz push from bar.rs. */
export interface BarSnapshot {
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
