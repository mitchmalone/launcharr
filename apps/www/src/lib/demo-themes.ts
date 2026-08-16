/**
 * Demo-panel themes: token subsets ported from the app's src/lib/themes.ts
 * built-ins (AGENTS invariant 2 — the demo mirrors the app; if the app's
 * palette changes, port the change). Just the tokens the panel chrome uses.
 */
export interface DemoTheme {
  glass: string
  border: string
  fg: string
  dim: string
  accent: string
  sigil: string
  bang: string
  selected: string
}

export const DEMO_THEMES: Record<string, DemoTheme> = {
  launcharr: {
    glass: 'rgba(28, 29, 42, 0.96)',
    border: '#393b54',
    fg: '#b5b9d9',
    dim: '#73747c',
    accent: '#ff176c',
    sigil: '#ff176c',
    bang: '#d29922',
    selected: 'rgba(181, 185, 217, 0.12)',
  },
  dracula: {
    glass: 'rgba(40, 42, 54, 0.96)',
    border: '#44475a',
    fg: '#f8f8f2',
    dim: '#6272a4',
    accent: '#bd93f9',
    sigil: '#50fa7b',
    bang: '#f1fa8c',
    selected: 'rgba(68, 71, 90, 0.55)',
  },
  terminal: {
    glass: 'rgba(0, 0, 0, 0.93)',
    border: '#123f12',
    fg: '#33ff33',
    dim: '#0f7f0f',
    accent: '#33ff33',
    sigil: '#33ff33',
    bang: '#33ff33',
    selected: 'rgba(51, 255, 51, 0.12)',
  },
  nord: {
    glass: 'rgba(46, 52, 64, 0.96)',
    border: '#4c566a',
    fg: '#eceff4',
    dim: '#7b88a1',
    accent: '#88c0d0',
    sigil: '#a3be8c',
    bang: '#ebcb8b',
    selected: 'rgba(136, 192, 208, 0.14)',
  },
  synthwave: {
    glass: 'rgba(38, 35, 53, 0.96)',
    border: '#495495',
    fg: '#f0eff1',
    dim: '#848bbd',
    accent: '#ff7edb',
    sigil: '#72f1b8',
    bang: '#fede5d',
    selected: 'rgba(255, 126, 219, 0.14)',
  },
  'solarized-light': {
    glass: 'rgba(253, 246, 227, 0.96)',
    border: '#d3cbb7',
    fg: '#657b83',
    dim: '#93a1a1',
    accent: '#268bd2',
    sigil: '#859900',
    bang: '#b58900',
    selected: 'rgba(38, 139, 210, 0.12)',
  },
}

export const DEMO_THEME_NAMES = Object.keys(DEMO_THEMES)
