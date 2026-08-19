import type { DesktopConfig } from '@launcharr/core/desktop'
import type { Link } from '@launcharr/core/types'
import type { BarModule, BarZones } from '@launcharr/tui'

import type { ThemeTokens } from './themes'

/**
 * App configuration. Desktop-only: it references ThemeTokens and app concerns (hotkey,
 * terminal hand-off), so it lives beside the app rather than in @launcharr/core.
 */
export type Config = {
  hotkey: string
  terminal: 'iTerm2' | 'Terminal'
  bangNewWindow: boolean
  sigil: string
  bangSigil: string
  launchAtLogin: boolean
  links: Link[]
  shortcuts: Record<string, string>
  /** Alfred-style dead-end fallback, {query} placeholder. */
  searchFallback: string
  indexBookmarks: boolean
  /** Active theme name: built-in (launcharr, dracula, terminal) or a `themes` key. */
  theme: string
  /** User-defined themes: name → partial token overrides (see lib/themes.ts). */
  themes: Record<string, Partial<ThemeTokens>>
  /** The menubar-replacement bar (v0.5). `enabled` hot-applies. */
  bar: BarConfig
  /** Agent monitoring + usage monitor; all off by default. */
  agents: AgentsConfig
  /** The desktop layer (v0.4): AeroSpace tiling, JankyBorders, corner radius. Rust
   * persists it opaquely; read it through `normalizeDesktop` (partial/absent → defaults). */
  desktop: Partial<DesktopConfig> | undefined
  /** `colorpicker` opens the launcharr loupe (2×) — needs Screen Recording, so it is
   * opt-in and the toggle is what triggers the prompt; off = Apple's sampler. */
  colorLoupe: boolean
  /** Loupe magnification, 2–8 (default 8). */
  colorLoupeZoom: number
  /** Loupe diameter in points (default 264). */
  colorLoupeSize: number
  /** Plain widget settings: widget id → KEY → value (manifest `settings`,
   * docs/WIDGETS.md). Secrets are Keychain-only and never appear here. */
  widgets: Record<string, Record<string, string>>
}

export type BarConfig = {
  enabled: boolean
  /** Alignment zones (mirrors BarZones in config.rs): every module lives in
   * left, center, or right, ordered within its zone. Clock is ordinary. */
  layout: BarZones
  /** Notched displays: left/right only (the camera housing owns the center);
   * absent → derived from `layout` via `notchedZones`. */
  notchedLayout?: BarZones | null
}

/* Shape lives in the kit — the bar renders from it in both the app and on
 * launcharr.com, so there is one definition (invariant 10). The *semantics*
 * below (normalization, notch derivation, legacy migration) are config
 * concerns and stay here. */
export type { BarModule, BarZones } from '@launcharr/tui'

export type ZoneName = 'left' | 'center' | 'right'
export const ZONE_NAMES: ZoneName[] = ['left', 'center', 'right']

const module = (id: string): BarModule => ({ id, enabled: true })

/** Default arrangement; also decides which zone a newly shipped widget joins. */
export const DEFAULT_BAR_LAYOUT: BarZones = {
  left: ['workspaces', 'agents', 'frontApp'].map(module),
  center: [module('clock')],
  right: ['wifi', 'awake', 'battery'].map(module),
}

/** Layout id for a user widget (docs/WIDGETS.md): `widget:<id>`. */
export const widgetModuleId = (id: string) => `widget:${id}`
export const isWidgetModuleId = (id: string) => id.startsWith('widget:')

/** What normalization needs to know about a discovered widget. */
export type WidgetHome = { id: string; zone: string }

/** Same normalization everywhere (bar renderer + settings): drop unknown ids,
 * append known-but-missing ids enabled into their default zone (falling back
 * to right, where new status widgets belong). Widget ids (`widget:*`) are
 * kept wherever the layout has them — Settings may not know the live set —
 * and discovered widgets missing from the layout join their manifest zone. */
export function normalizeBarZones(
  zones: BarZones,
  widgets: WidgetHome[] = [],
): BarZones {
  const known = new Set<string>(BAR_MODULE_IDS)
  const seen = new Set<string>()
  const out: BarZones = { left: [], center: [], right: [] }
  for (const zone of ZONE_NAMES) {
    for (const m of zones[zone]) {
      if ((known.has(m.id) || isWidgetModuleId(m.id)) && !seen.has(m.id)) {
        seen.add(m.id)
        out[zone].push(m)
      }
    }
  }
  for (const id of BAR_MODULE_IDS) {
    if (seen.has(id)) continue
    const home =
      ZONE_NAMES.find((z) => DEFAULT_BAR_LAYOUT[z].some((m) => m.id === id)) ??
      'right'
    out[home].push(module(id))
  }
  for (const w of widgets) {
    const id = widgetModuleId(w.id)
    if (seen.has(id)) continue
    seen.add(id)
    const home = (ZONE_NAMES as string[]).includes(w.zone)
      ? (w.zone as ZoneName)
      : 'right'
    out[home].push(module(id))
  }
  return out
}

/** The arrangement a notched display uses: the explicit one when set, else
 * the main layout — normalized, then center folded into the head of the right
 * zone (a notched bar has no center; the camera housing owns it). */
export function notchedZones(
  bar: BarConfig,
  widgets: WidgetHome[] = [],
): BarZones {
  const base = normalizeBarZones(bar.notchedLayout ?? bar.layout, widgets)
  return {
    left: base.left,
    center: [],
    right: [...base.center, ...base.right],
  }
}

export type AgentsConfig = {
  /** Local agent session monitoring (socket, bar cells, `agents ⏎`). */
  monitor: boolean
  /** Show idle sessions in the bar; active states always show. */
  showIdle: boolean
  /** Sessions silent this long are pruned. */
  pruneHours: number
  /** The `usage ⏎` token monitor. */
  usage: boolean
  /** Agent mode: `?` converses with the user's own agent CLI. */
  askMode: boolean
  /** Which CLI answers `?`. */
  askProvider: 'claude' | 'codex'
  /** Consent capabilities: launcharr may read the CLI's stored credentials
   * for account-limit fetches; the code owns source selection + fallback. */
  claudeCreds: boolean
  codexCreds: boolean
}

/** Every widget the bar knows (TS-only; Rust just stores zones). */
export const BAR_MODULE_IDS = [
  'workspaces',
  'agents',
  'frontApp',
  'clock',
  'wifi',
  'awake',
  'battery',
] as const

export const DEFAULT_AGENTS_CONFIG: AgentsConfig = {
  monitor: false,
  showIdle: true,
  pruneHours: 12,
  usage: false,
  askMode: false,
  askProvider: 'claude',
  claudeCreds: false,
  codexCreds: false,
}
