import { fuzzyMatch } from '@launcharr/core/matcher'

/** Mirrors `Screenshot` in `src-tauri/src/screenshots.rs`. */
export interface Screenshot {
  path: string
  name: string
  mtimeMs: number
}

/** Mirrors `ScreenshotAction` in Rust. Reveal reuses `reveal_item`. */
export type ScreenshotAction = 'copy' | 'open'

/** "now" · "25m" · "3h" · "yesterday" · "Fri" · "3 Aug" — one glance, no clock math. */
export function relativeAge(mtimeMs: number, nowMs: number): string {
  const s = Math.max(0, Math.round((nowMs - mtimeMs) / 1000))
  if (s < 60) return 'now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 2) return 'yesterday'
  const date = new Date(mtimeMs)
  if (d < 7) return date.toLocaleDateString('en-AU', { weekday: 'short' })
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

/** Fuzzy filter on filename via the shared core matcher; empty query = as listed. */
export function filterScreenshots(
  shots: Screenshot[],
  query: string,
): Screenshot[] {
  const q = query.trim()
  if (!q) return shots
  return shots
    .map((shot) => ({ shot, m: fuzzyMatch(q, shot.name) }))
    .filter((x) => x.m !== null)
    .sort((a, b) => (b.m?.score ?? 0) - (a.m?.score ?? 0))
    .map((x) => x.shot)
}
