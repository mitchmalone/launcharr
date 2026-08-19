/**
 * Themes: a flat map of the color tokens both windows already style with. Built-ins live
 * here; user themes are plain JSON in config.json under `themes` (name → partial token
 * map), overlaying the launcharr defaults — or, when named after a built-in, that
 * built-in. Selection is `config.theme`; unknown names fall back to `launcharr` so a
 * hand-edit can't blank the UI.
 *
 * Reachable as `@launcharr/tui/themes` as well as through the barrel, and that second
 * entry point is load-bearing: this module is pure data, so a React Server Component
 * (apps/www) can import the tokens directly. Going through `.` instead drags in
 * `components/controls.tsx`, whose hooks fail a server build. Keep it free of React.
 */

export interface ThemeTokens {
  /** Opaque window background (settings). */
  bg: string
  /** Raised surface: settings sections, inputs, pills. */
  surface: string
  /** Translucent background for the floating panel. */
  glass: string
  border: string
  fg: string
  dim: string
  accent: string
  /** Launch-mode prompt sigil. */
  sigil: string
  /** Bang-mode prompt sigil. */
  bang: string
  /** Selected-row background (panel). */
  selected: string
  /** Alert tier below danger: bar cells and widget tones (battery low, weak wifi). */
  warn: string
  danger: string
}

export const BUILTIN_THEMES: Record<string, ThemeTokens> = {
  launcharr: {
    bg: '#1c1d2a',
    surface: '#262838',
    glass: 'rgba(28, 29, 42, 0.96)',
    border: '#393b54',
    fg: '#b5b9d9',
    dim: '#73747c',
    accent: '#ff6b8c',
    sigil: '#ff6b8c',
    bang: '#d29922',
    selected: 'rgba(181, 185, 217, 0.12)',
    warn: '#d29922',
    danger: '#f85149',
  },
  dracula: {
    bg: '#282a36',
    surface: '#313445',
    glass: 'rgba(40, 42, 54, 0.96)',
    border: '#44475a',
    fg: '#f8f8f2',
    dim: '#6272a4',
    accent: '#bd93f9',
    sigil: '#50fa7b',
    bang: '#f1fa8c',
    selected: 'rgba(68, 71, 90, 0.55)',
    warn: '#f1fa8c',
    danger: '#ff5555',
  },
  terminal: {
    bg: '#000000',
    surface: '#0a120a',
    glass: 'rgba(0, 0, 0, 0.93)',
    border: '#123f12',
    fg: '#33ff33',
    dim: '#0f7f0f',
    accent: '#33ff33',
    sigil: '#33ff33',
    bang: '#33ff33',
    selected: 'rgba(51, 255, 51, 0.12)',
    warn: '#33ff33',
    danger: '#ff3333',
  },
  amber: {
    bg: '#000000',
    surface: '#140d00',
    glass: 'rgba(0, 0, 0, 0.93)',
    border: '#4a3200',
    fg: '#ffb000',
    dim: '#8a5f00',
    accent: '#ffb000',
    sigil: '#ffb000',
    bang: '#ffcf60',
    selected: 'rgba(255, 176, 0, 0.12)',
    warn: '#ffcf60',
    danger: '#ff5533',
  },
  catppuccin: {
    bg: '#1e1e2e',
    surface: '#313244',
    glass: 'rgba(30, 30, 46, 0.96)',
    border: '#45475a',
    fg: '#cdd6f4',
    dim: '#6c7086',
    accent: '#cba6f7',
    sigil: '#a6e3a1',
    bang: '#f9e2af',
    selected: 'rgba(203, 166, 247, 0.14)',
    warn: '#f9e2af',
    danger: '#f38ba8',
  },
  gruvbox: {
    bg: '#282828',
    surface: '#3c3836',
    glass: 'rgba(40, 40, 40, 0.96)',
    border: '#504945',
    fg: '#ebdbb2',
    dim: '#928374',
    accent: '#fe8019',
    sigil: '#b8bb26',
    bang: '#fabd2f',
    selected: 'rgba(254, 128, 25, 0.14)',
    warn: '#fabd2f',
    danger: '#fb4934',
  },
  monokai: {
    bg: '#272822',
    surface: '#34352d',
    glass: 'rgba(39, 40, 34, 0.96)',
    border: '#49483e',
    fg: '#f8f8f2',
    dim: '#75715e',
    accent: '#f92672',
    sigil: '#a6e22e',
    bang: '#e6db74',
    selected: 'rgba(249, 38, 114, 0.14)',
    warn: '#e6db74',
    danger: '#ff6188',
  },
  nord: {
    bg: '#2e3440',
    surface: '#3b4252',
    glass: 'rgba(46, 52, 64, 0.96)',
    border: '#4c566a',
    fg: '#eceff4',
    dim: '#7b88a1',
    accent: '#88c0d0',
    sigil: '#a3be8c',
    bang: '#ebcb8b',
    selected: 'rgba(136, 192, 208, 0.14)',
    warn: '#ebcb8b',
    danger: '#bf616a',
  },
  'one-dark': {
    bg: '#282c34',
    surface: '#2c313a',
    glass: 'rgba(40, 44, 52, 0.96)',
    border: '#3e4451',
    fg: '#abb2bf',
    dim: '#5c6370',
    accent: '#61afef',
    sigil: '#98c379',
    bang: '#e5c07b',
    selected: 'rgba(97, 175, 239, 0.14)',
    warn: '#e5c07b',
    danger: '#e06c75',
  },
  'rose-pine': {
    bg: '#191724',
    surface: '#26233a',
    glass: 'rgba(25, 23, 36, 0.96)',
    border: '#403d52',
    fg: '#e0def4',
    dim: '#6e6a86',
    accent: '#ebbcba',
    sigil: '#9ccfd8',
    bang: '#f6c177',
    selected: 'rgba(235, 188, 186, 0.12)',
    warn: '#f6c177',
    danger: '#eb6f92',
  },
  solarized: {
    bg: '#002b36',
    surface: '#073642',
    glass: 'rgba(0, 43, 54, 0.96)',
    border: '#175263',
    fg: '#93a1a1',
    dim: '#586e75',
    accent: '#268bd2',
    sigil: '#859900',
    bang: '#b58900',
    selected: 'rgba(38, 139, 210, 0.14)',
    warn: '#b58900',
    danger: '#dc322f',
  },
  'solarized-light': {
    bg: '#fdf6e3',
    surface: '#eee8d5',
    glass: 'rgba(253, 246, 227, 0.96)',
    border: '#d3cbb7',
    fg: '#657b83',
    dim: '#93a1a1',
    accent: '#268bd2',
    sigil: '#859900',
    bang: '#b58900',
    selected: 'rgba(38, 139, 210, 0.12)',
    warn: '#b58900',
    danger: '#dc322f',
  },
  synthwave: {
    bg: '#262335',
    surface: '#34294f',
    glass: 'rgba(38, 35, 53, 0.96)',
    border: '#495495',
    fg: '#f0eff1',
    dim: '#848bbd',
    accent: '#ff7edb',
    sigil: '#72f1b8',
    bang: '#fede5d',
    selected: 'rgba(255, 126, 219, 0.14)',
    warn: '#fede5d',
    danger: '#fe4450',
  },
  'tokyo-night': {
    bg: '#1a1b26',
    surface: '#24283b',
    glass: 'rgba(26, 27, 38, 0.96)',
    border: '#3b4261',
    fg: '#c0caf5',
    dim: '#565f89',
    accent: '#7aa2f7',
    sigil: '#9ece6a',
    bang: '#e0af68',
    selected: 'rgba(122, 162, 247, 0.14)',
    warn: '#e0af68',
    danger: '#f7768e',
  },
}

const DEFAULT_THEME = 'launcharr'

export type CustomThemes = Record<string, Partial<ThemeTokens>> | undefined

/** Resolve a theme name against built-ins + config-defined customs. */
export function resolveTheme(name: string, themes: CustomThemes): ThemeTokens {
  const base = BUILTIN_THEMES[name] ?? BUILTIN_THEMES[DEFAULT_THEME]!
  const custom = themes?.[name]
  return custom ? { ...base, ...custom } : base
}

/** Selectable theme names: built-ins first, then customs, deduped, stable order. */
export function themeNames(themes: CustomThemes): string[] {
  const builtin = Object.keys(BUILTIN_THEMES)
  const custom = Object.keys(themes ?? {}).filter((n) => !BUILTIN_THEMES[n])
  return [...builtin, ...custom]
}

/** Whether a #rgb/#rrggbb color reads as light (drives `color-scheme`). Non-hex → dark. */
export function isLightColor(color: string): boolean {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())
  if (!m) return false
  const hex = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join('') : m[1]!
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! > 140
}

/** The flat checkmark as a data URI in the theme's fg color (CSS vars can't reach into url()). */
function checkUrl(fg: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'><path d='M2.5 6.5l2.5 2.5 4.5-5' fill='none' stroke='${fg}' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

/** CSS variable map for one window kind; each window applies its own. */
export function themeVars(
  t: ThemeTokens,
  kind: 'panel' | 'settings',
): Record<string, string> {
  const shared = {
    '--border': t.border,
    '--fg': t.fg,
    '--dim': t.dim,
    '--accent': t.accent,
    '--sigil': t.sigil,
    // Alert tiers: the bar (a panel-kind window) and settings both reach for them.
    '--warn': t.warn,
    '--danger': t.danger,
  }
  if (kind === 'panel') {
    return {
      ...shared,
      '--bg': t.glass,
      '--bang': t.bang,
      '--selected': t.selected,
    }
  }
  return {
    ...shared,
    '--bg': t.bg,
    '--panel': t.surface,
    '--check': checkUrl(t.fg),
  }
}

/** Apply a theme to the current document. */
export function applyTheme(
  theme: string,
  themes: CustomThemes,
  kind: 'panel' | 'settings',
): void {
  const tokens = resolveTheme(theme, themes)
  const vars = themeVars(tokens, kind)
  for (const [k, v] of Object.entries(vars)) {
    document.documentElement.style.setProperty(k, v)
  }
  // Native widgets (scrollbars, selects) must match the theme's polarity.
  document.documentElement.style.colorScheme = isLightColor(tokens.bg)
    ? 'light'
    : 'dark'
}
