/**
 * Themes: a flat map of the color tokens both windows already style with. Built-ins live
 * here; user themes are plain JSON in config.json under `themes` (name → partial token
 * map), overlaying the launcharr defaults — or, when named after a built-in, that
 * built-in. Selection is `config.theme`; unknown names fall back to `launcharr` so a
 * hand-edit can't blank the UI.
 */

export interface ThemeTokens {
  /** Opaque window background (settings). */
  bg: string;
  /** Raised surface: settings sections, inputs, pills. */
  surface: string;
  /** Translucent background for the floating panel. */
  glass: string;
  border: string;
  fg: string;
  dim: string;
  accent: string;
  /** Launch-mode prompt sigil. */
  sigil: string;
  /** Bang-mode prompt sigil. */
  bang: string;
  /** Selected-row background (panel). */
  selected: string;
  danger: string;
}

export const BUILTIN_THEMES: Record<string, ThemeTokens> = {
  launcharr: {
    bg: '#1c1d2d',
    surface: '#26283b',
    glass: 'rgba(28, 29, 45, 0.96)',
    border: '#3a3c56',
    fg: '#e9eaf4',
    dim: '#8b8dab',
    accent: '#ff6b8c',
    sigil: '#3fb950',
    bang: '#d29922',
    selected: 'rgba(255, 107, 140, 0.14)',
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
    danger: '#ff3333',
  },
};

const DEFAULT_THEME = 'launcharr';

export type CustomThemes = Record<string, Partial<ThemeTokens>> | undefined;

/** Resolve a theme name against built-ins + config-defined customs. */
export function resolveTheme(name: string, themes: CustomThemes): ThemeTokens {
  const base = BUILTIN_THEMES[name] ?? BUILTIN_THEMES[DEFAULT_THEME];
  const custom = themes?.[name];
  return custom ? { ...base, ...custom } : base;
}

/** Selectable theme names: built-ins first, then customs, deduped, stable order. */
export function themeNames(themes: CustomThemes): string[] {
  const builtin = Object.keys(BUILTIN_THEMES);
  const custom = Object.keys(themes ?? {}).filter((n) => !BUILTIN_THEMES[n]);
  return [...builtin, ...custom];
}

/** CSS variable map for one window kind; each window applies its own. */
export function themeVars(
  t: ThemeTokens,
  kind: 'panel' | 'settings'
): Record<string, string> {
  const shared = {
    '--border': t.border,
    '--fg': t.fg,
    '--dim': t.dim,
    '--accent': t.accent,
    '--sigil': t.sigil,
  };
  if (kind === 'panel') {
    return {
      ...shared,
      '--bg': t.glass,
      '--bang': t.bang,
      '--selected': t.selected,
    };
  }
  return {
    ...shared,
    '--bg': t.bg,
    '--panel': t.surface,
    '--danger': t.danger,
  };
}

/** Apply a theme to the current document. */
export function applyTheme(
  theme: string,
  themes: CustomThemes,
  kind: 'panel' | 'settings'
): void {
  const vars = themeVars(resolveTheme(theme, themes), kind);
  for (const [k, v] of Object.entries(vars)) {
    document.documentElement.style.setProperty(k, v);
  }
}
