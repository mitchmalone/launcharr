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
}
