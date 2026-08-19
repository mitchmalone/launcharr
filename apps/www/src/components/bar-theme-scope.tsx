import { BUILTIN_THEMES, themeVars } from '@launcharr/tui/themes'

/**
 * Scopes the app's panel theme tokens to a subtree.
 *
 * `@launcharr/tui/bar.css` styles against unprefixed `--bg` / `--fg` / `--dim`
 * / `--accent` / `--sigil` — in the app those are set on :root by `applyTheme`,
 * but on the website those same names are the *page* palette. Setting them here
 * hands the bar its own tokens without touching the rest of the page, using the
 * kit's own `themeVars`, so there's no second copy of the mapping.
 */
export function BarThemeScope({
  theme = 'launcharr',
  className,
  children,
}: {
  theme?: string
  className?: string
  children: React.ReactNode
}) {
  const tokens = BUILTIN_THEMES[theme] ?? BUILTIN_THEMES.launcharr!
  return (
    <div
      className={className}
      style={themeVars(tokens, 'panel') as React.CSSProperties}
    >
      {children}
    </div>
  )
}
