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

export function batteryTone(
  pct: number | null,
  onAc: boolean,
  charging: boolean,
): CellTone {
  if (charging || pct == null || onAc) return 'normal'
  if (pct < 20) return 'danger'
  if (pct < 50) return 'warn'
  return 'normal'
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

/** "−66 dBm · good" for the card; empty when unknown. */
export function wifiSignalLabel(rssi: number | null): string {
  if (rssi == null) return ''
  const word = ['', 'poor', 'fair', 'good', 'excellent'][wifiBars(rssi)]
  return `${rssi} dBm · ${word}`
}
