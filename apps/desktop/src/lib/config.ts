import type { Link } from '@launcharr/core/types'

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
}

export type BarConfig = {
  enabled: boolean
  /** Ordered widgets, left→right; `clock` is the center anchor. */
  modules: { id: string; enabled: boolean }[]
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
  /** Account rate-limit fetch sources (network, opt-in per provider). */
  claudeLimits: 'off' | 'credentialsFile' | 'keychain'
  codexLimits: 'off' | 'authFile'
}

/** Default widget order; mirrored in config.rs (BAR_MODULE_IDS). */
export const BAR_MODULE_IDS = [
  'workspaces',
  'agents',
  'frontApp',
  'clock',
  'wifi',
  'trmnl',
  'battery',
] as const

export const DEFAULT_BAR_MODULES = BAR_MODULE_IDS.map((id) => ({
  id: id as string,
  enabled: true,
}))

export const DEFAULT_AGENTS_CONFIG: AgentsConfig = {
  monitor: false,
  showIdle: true,
  pruneHours: 12,
  usage: false,
  claudeLimits: 'off',
  codexLimits: 'off',
}
