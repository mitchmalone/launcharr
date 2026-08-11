/**
 * Keyboard-event → accelerator-string formatting for the hotkey recorder.
 *
 * Output must stay parseable by the Rust side's global-shortcut plugin
 * (global-hotkey's `parse_key`, which accepts W3C code names and friendly
 * aliases like "S", "3", "Space", "Up"). We derive from `event.code` so the
 * recorded chord is keyboard-layout-independent, then prettify the token.
 */

export interface AcceleratorKeyEvent {
  code: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
}

/** Codes that pass through to the accelerator string unchanged. */
const PASSTHROUGH = new Set([
  'Space',
  'Enter',
  'Tab',
  'Delete',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Comma',
  'Period',
  'Slash',
  'Semicolon',
  'Quote',
  'BracketLeft',
  'BracketRight',
  'Backslash',
  'Backquote',
  'Minus',
  'Equal',
])

const ARROWS: Record<string, string> = {
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
}

const F_KEY = /^F([1-9]|1[0-2])$/

/** Main-key token for an event code, or null if it can't anchor a hotkey. */
function keyToken(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3)
  if (/^Digit[0-9]$/.test(code)) return code.slice(5)
  if (F_KEY.test(code)) return code
  if (code in ARROWS) return ARROWS[code]!
  if (PASSTHROUGH.has(code)) return code
  return null
}

/**
 * Format a keydown as an accelerator string, or null if the chord isn't a
 * usable global hotkey yet: modifier-only, reserved key (Esc/Backspace are
 * recorder UI), or a bare/shift-only key that isn't an F-key.
 */
export function acceleratorFromEvent(e: AcceleratorKeyEvent): string | null {
  const key = keyToken(e.code)
  if (!key) return null
  const anchored = e.metaKey || e.ctrlKey || e.altKey || F_KEY.test(key)
  if (!anchored) return null

  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  if (e.metaKey) parts.push('Cmd')
  parts.push(key)
  return parts.join('+')
}

const MOD_GLYPHS: Record<string, string> = {
  ctrl: '⌃',
  control: '⌃',
  alt: '⌥',
  option: '⌥',
  shift: '⇧',
  cmd: '⌘',
  command: '⌘',
  super: '⌘',
  meta: '⌘',
  commandorcontrol: '⌘',
  cmdorctrl: '⌘',
  commandorctrl: '⌘',
  cmdorcontrol: '⌘',
}

const KEY_GLYPHS: Record<string, string> = {
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
}

/** Render "Cmd+Shift+S" as "⇧⌘S" for display; unknown strings pass through. */
export function prettyAccelerator(accel: string): string {
  const tokens = accel.split('+').filter(Boolean)
  if (tokens.length === 0) return accel

  const glyphs = { '⌃': false, '⌥': false, '⇧': false, '⌘': false }
  let key: string | null = null
  for (const token of tokens) {
    const mod = MOD_GLYPHS[token.toLowerCase()]
    if (mod) glyphs[mod as keyof typeof glyphs] = true
    else if (key) return accel
    else key = token
  }
  if (!key) return accel

  const lower = key.toLowerCase()
  const shown =
    KEY_GLYPHS[lower] ?? (key.length === 1 ? key.toUpperCase() : key)
  const mods = (Object.keys(glyphs) as (keyof typeof glyphs)[])
    .filter((g) => glyphs[g])
    .join('')
  return mods + shown
}
