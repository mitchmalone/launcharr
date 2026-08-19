import type { AgentSession, BatteryDetail } from './types'

/** Pure formatting and grouping for the bar. No React, no environment. */

/** The strip's height in points — bar.css `.bar { height }`, bar.rs BAR_HEIGHT and
 * the AeroSpace top gap all agree on this one number. */
export const BAR_STRIP_HEIGHT = 30

export const AGENT_GLYPHS: Record<string, string> = {
  working: '●',
  attention: '◉',
  done: '●',
  idle: '○',
}

/** User-facing state names where the wire name reads wrong. */
export const AGENT_STATE_LABELS: Record<string, string> = {
  attention: 'blocked',
  done: 'done · unread',
}

export const agentGlyph = (state: string) => AGENT_GLYPHS[state] ?? '○'
export const agentStateLabel = (state: string) =>
  AGENT_STATE_LABELS[state] ?? state

export function agentAge(updatedAt: number, now: Date): string {
  const s = Math.max(0, Math.floor(now.getTime() / 1000) - updatedAt)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.round(s / 60)}m`
  return `${Math.round(s / 3600)}h`
}

/** The card's location line, or its no-pane fallback. Reads as a place, not a
 * fault: since liveness is checked by process too (agents.rs), an agent with no
 * pane is simply one running outside a multiplexer. */
export function agentLocation(a: AgentSession): string {
  if (!a.muxGroup) return a.mux ? `in ${a.mux}` : 'outside a multiplexer'
  return (
    `${a.muxGroup} · tab ${a.muxIndex}` + (a.muxLabel ? ` · ${a.muxLabel}` : '')
  )
}

/**
 * Multiplexer groups — tmux session or herdr workspace, ordered by name, cells
 * by tab index — plus loose cells for agents in no multiplexer at all;
 * invocation order never decides placement. The caller boxes the loose ones too
 * (dashed): an ungrouped glyph floating beside the boxes read as breakage
 * rather than as "not in one".
 */
export function groupAgents(agents: AgentSession[]): {
  groups: [string, AgentSession[]][]
  loose: AgentSession[]
} {
  const byName = new Map<string, AgentSession[]>()
  const loose: AgentSession[] = []
  for (const a of agents) {
    if (a.muxGroup) {
      const list = byName.get(a.muxGroup) ?? []
      list.push(a)
      byName.set(a.muxGroup, list)
    } else {
      loose.push(a)
    }
  }
  for (const list of byName.values()) {
    list.sort(
      (x, y) =>
        (x.muxIndex ?? 0) - (y.muxIndex ?? 0) ||
        x.session.localeCompare(y.session),
    )
  }
  loose.sort((x, y) => x.session.localeCompare(y.session))
  const groups = [...byName.entries()].sort(([a], [b]) => a.localeCompare(b))
  return { groups, loose }
}

/** Sketchybar parity: "Sat 16 Aug 07:45". */
export function formatBarClock(now: Date): string {
  const date = now
    .toLocaleDateString('en-AU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    })
    .replace(',', '')
  const hh = now.getHours().toString().padStart(2, '0')
  const mm = now.getMinutes().toString().padStart(2, '0')
  return `${date} ${hh}:${mm}`
}

/** "4h 58m" / "58m" — the same shape macOS puts in its own battery menu. */
export function timeLeft(minutes: number): string {
  const h = Math.floor(minutes / 60)
  return h > 0 ? `${h}h ${minutes % 60}m` : `${minutes}m`
}

/** The lead line under "Battery": what the pack is doing right now. */
export function batteryState(d: BatteryDetail): string {
  if (d.charging) return 'charging'
  if (d.onAc) return d.fullyCharged ? 'charged' : 'AC attached · not charging'
  return 'discharging'
}

/**
 * Alert tiers for a right-zone cell. `.bar-warn`/`.bar-danger` are scoped under
 * `.bar-right` in CSS so they outrank `.bar-cell` (JOURNAL 2026-08-16).
 */
export type CellTone = 'normal' | 'warn' | 'danger'

export const toneClass = (tone: CellTone) =>
  tone === 'normal' ? 'bar-cell' : `bar-cell bar-${tone}`

/**
 * "Adjusted charge": with a charge limit set (Battery → "Limit to 80 %"), the
 * limit is what full means — 80 % on a limited pack reads as 100 %. The card
 * keeps the true percentage; only the strip's glyph is judged against it.
 */
export function adjustedPct(pct: number, chargeLimit: number | null): number {
  if (chargeLimit == null || chargeLimit <= 0 || chargeLimit >= 100) return pct
  return Math.min(100, Math.round((pct / chargeLimit) * 100))
}

export type BatteryGlyph = 'charging' | 'full' | 'medium' | 'low' | 'warning'
/** Cell colour: charging is blue, healthy green, running down amber, empty red. */
export type BatteryTone = 'charging' | 'good' | 'warn' | 'danger'

export interface BatteryLook {
  glyph: BatteryGlyph
  tone: BatteryTone
  /** Judged against the charge limit — what the strip is drawn from. */
  adjusted: number
  /** Only the red tier prints its number next to the glyph. */
  showPct: boolean
}

/**
 * What the strip draws for a battery, from the adjusted charge (2026-08-19):
 * charging → blue (the charging glyph from 90 %, else the level glyph);
 * otherwise full ≥ 50 % green, medium < 50 % and low < 25 % amber,
 * warning < 10 % red with the percentage. Plugged in counts as charging
 * for the strip: at the charge limit macOS reports "AC attached; not
 * charging", and Mitch still wants the cell to read as on power (2026-08-19)
 * — the card keeps the charging/held distinction.
 */
export function batteryLook(
  pct: number,
  charging: boolean,
  chargeLimit: number | null,
  onAc = false,
): BatteryLook {
  const adjusted = adjustedPct(pct, chargeLimit)
  charging = charging || onAc
  const level: BatteryGlyph =
    adjusted >= 50
      ? 'full'
      : adjusted >= 25
        ? 'medium'
        : adjusted >= 10
          ? 'low'
          : 'warning'
  if (charging) {
    return {
      glyph: adjusted >= 90 ? 'charging' : level,
      tone: 'charging',
      adjusted,
      showPct: false,
    }
  }
  const tone: BatteryTone =
    level === 'full' ? 'good' : level === 'warning' ? 'danger' : 'warn'
  return { glyph: level, tone, adjusted, showPct: level === 'warning' }
}

/** Wi-Fi bars from RSSI (dBm): 4 = full, 1 = poor; unknown reads as full so a
 * missing reading never looks like a bad link. Thresholds follow the usual
 * client bands (≥ −60 excellent, −60…−70 good, −70…−80 fair, below poor). */
export function wifiBars(rssi: number | null): 1 | 2 | 3 | 4 {
  if (rssi == null) return 4
  if (rssi >= -60) return 4
  if (rssi >= -70) return 3
  if (rssi >= -80) return 2
  return 1
}

/**
 * Cell tone for the wifi glyph (2026-08-19): offline is danger, a poor link
 * (1 bar, below −80 dBm) is warn, anything better is plain fg — "fair" still
 * works, and the arcs already say it's not full.
 */
export function wifiTone(online: boolean, rssi: number | null): CellTone {
  if (!online) return 'danger'
  return wifiBars(rssi) <= 1 ? 'warn' : 'normal'
}

/** "−66 dBm · good" for the card; empty when unknown. */
export function wifiSignalLabel(rssi: number | null): string {
  if (rssi == null) return ''
  const word = ['', 'poor', 'fair', 'good', 'excellent'][wifiBars(rssi)]
  return `${rssi} dBm · ${word}`
}

/* ---- widgets ---------------------------------------------------------- */

/** The tones a widget may name (docs/WIDGETS.md); anything else is plain. */
export const WIDGET_TONES = ['ok', 'warn', 'error', 'muted', 'accent'] as const

/** `bar-tone-<tone>` for a known tone, '' for none/unknown — cells and dots. */
export function widgetToneClass(tone: string | null | undefined): string {
  return tone && (WIDGET_TONES as readonly string[]).includes(tone)
    ? `bar-tone-${tone}`
    : ''
}

/**
 * The card's health line for a failing widget: what went wrong and when it
 * last worked. Healthy widgets get null (no line).
 */
export function widgetHealth(
  error: string | null,
  lastOk: number | null,
  now: Date,
): string | null {
  if (!error) return null
  return lastOk == null
    ? error
    : `${error} · last ok ${agentAge(lastOk, now)} ago`
}
