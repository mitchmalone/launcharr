import {
  BatteryCharging,
  BatteryFull,
  BatteryLow,
  BatteryMedium,
  Wifi,
  WifiOff,
} from 'lucide-react'
import type { ReactNode } from 'react'

import {
  agentAge,
  agentGlyph,
  agentLocation,
  agentStateLabel,
  batteryState,
  batteryTone,
  groupAgents,
  timeLeft,
  toneClass,
  trmnlTone,
} from './format'
import type {
  AgentSession,
  BarHoverApi,
  BarSnapshot,
  BatteryDetail,
} from './types'

/**
 * The bar's presentational layer — the single copy of the strip's chrome,
 * rendered by both the desktop app and launcharr.com (AGENTS invariant 10).
 *
 * Nothing here touches the environment: no `invoke`, no Rust, no window
 * globals. Data comes in as props and interactions go out as callbacks, so the
 * app can wire them to Tauri commands and the website to fictional data.
 */

/* ---- strip shell ---------------------------------------------------- */

/**
 * The 30px strip. Zones are handed in already resolved — notch profiles and
 * legacy-config migration are config semantics that live beside `Config`.
 * A notched display passes no `center`: the camera housing owns the middle.
 */
export function Bar({
  left,
  center,
  right,
  sigil = '❯',
}: {
  left?: ReactNode
  center?: ReactNode
  right?: ReactNode
  sigil?: ReactNode
}) {
  const hasCenter = Array.isArray(center) ? center.length > 0 : center != null
  return (
    <div className="bar">
      <div className="bar-left">
        {sigil != null && <span className="bar-logo">{sigil}</span>}
        {left}
      </div>
      {hasCenter && <div className="bar-center">{center}</div>}
      <div className="bar-right">{right}</div>
    </div>
  )
}

/* ---- cards ----------------------------------------------------------- */

/**
 * A dropdown card hanging under the strip. `cardRef` lets the consumer size
 * itself to the card (the desktop grows its window; a web page doesn't need
 * to). Kept generic so a new hovering cell needs no change here.
 */
export function BarCard({
  variant,
  cardRef,
  children,
}: {
  /** Adds `.bar-<variant>-card` for per-card width/anchoring. */
  variant?: string
  cardRef?: (el: HTMLElement | null) => void
  children: ReactNode
}) {
  return (
    <div
      className={`bar-card ${variant ? `bar-${variant}-card` : ''}`}
      ref={cardRef}
    >
      {children}
    </div>
  )
}

export const BarCardTitle = ({ children }: { children: ReactNode }) => (
  <div className="bar-card-title">{children}</div>
)

export const BarCardLine = ({
  className = '',
  children,
}: {
  className?: string
  children: ReactNode
}) => <div className={`bar-card-line ${className}`}>{children}</div>

export const BarCardDim = ({ children }: { children: ReactNode }) => (
  <div className="bar-card-line bar-card-dim">{children}</div>
)

export const BarCardSection = ({ children }: { children: ReactNode }) => (
  <div className="bar-card-section">{children}</div>
)

export const BarCardHint = ({ children }: { children: ReactNode }) => (
  <div className="bar-card-hint">{children}</div>
)

/* ---- cells ----------------------------------------------------------- */

/** Lucide icons in bar cells, sized to the 12px monospace strip. Custom
 * Lucide-style brand icons (24×24 viewBox, 2px stroke) take the same props. */
export const ICON_PROPS = {
  size: 14,
  strokeWidth: 2.2,
  'aria-hidden': true,
} as const

/** Which battery glyph a reading gets. Lives here so no consumer re-derives it. */
export function batteryIcon(
  pct: number | null,
  onAc: boolean,
  charging: boolean,
) {
  if (charging || onAc) return BatteryCharging
  if (pct != null && pct >= 75) return BatteryFull
  if (pct != null && pct >= 35) return BatteryMedium
  return BatteryLow
}

/** A plain right-zone cell: icon + label, tone class chosen by the caller. */
export function BarCell({
  className = 'bar-cell',
  title,
  children,
}: {
  className?: string
  title?: string
  children: ReactNode
}) {
  return (
    <span className={className} title={title}>
      {children}
    </span>
  )
}

/**
 * A cell that owns a hover card. This is the seam every hovering module uses —
 * battery today, anything else tomorrow — so adding one needs no kit change:
 * hand it an id, the height its card wants, the cell body, and the card body.
 */
export function BarHoverCell({
  id,
  cardHeight,
  hover,
  className = 'bar-cell',
  wrapperClassName,
  onClick,
  card,
  children,
}: {
  id: string
  cardHeight: number
  hover: BarHoverApi
  className?: string
  /** Positioning context for the card (e.g. `bar-battery`). */
  wrapperClassName?: string
  onClick?: () => void
  card?: ReactNode
  children: ReactNode
}) {
  const open = hover.hovered === id
  return (
    <span className={wrapperClassName}>
      <button
        type="button"
        data-hover={id}
        data-hover-height={cardHeight}
        className={className}
        onMouseEnter={() => hover.enter(id, cardHeight)}
        onClick={onClick}
      >
        {children}
      </button>
      {open && card}
    </span>
  )
}

/** Aerospace workspaces. The focused one is a solid block, Omarchy-style. */
export function BarWorkspaces({
  workspaces,
  focused,
  onSwitch,
}: {
  workspaces: string[]
  focused: string | null
  onSwitch: (ws: string) => void
}) {
  if (workspaces.length === 0) return null
  return (
    <div className="bar-ws-cluster">
      {workspaces.map((ws) => (
        <button
          key={ws}
          type="button"
          className={`bar-ws ${ws === focused ? 'bar-ws-focused' : ''}`}
          onClick={() => onSwitch(ws)}
        >
          {ws}
        </button>
      ))}
    </div>
  )
}

/** The focused application: dim, truncated at 32ch, never shouts. */
export const BarFrontApp = ({ name }: { name: string }) => (
  <span className="bar-app">{name}</span>
)

export const BarClock = ({ children }: { children: ReactNode }) => (
  <span className="bar-clock">{children}</span>
)

/**
 * Agent session cells: one glyph per session, boxed by tmux session and ordered
 * by tab. Hovering opens a dropdown card with the agent's task, state and tmux
 * location; clicking jumps to the pane (and marks a done session read).
 */
export function BarAgents({
  agents,
  now,
  hover,
  cardHeight = 130,
  onJump,
}: {
  agents: AgentSession[]
  now: Date
  hover: BarHoverApi
  cardHeight?: number
  onJump?: (session: string) => void
}) {
  if (agents.length === 0) return null

  const { groups, loose } = groupAgents(agents)
  const hoveredId = hover.hovered?.startsWith('agent:')
    ? hover.hovered.slice('agent:'.length)
    : null
  const hovered = agents.find((a) => a.session === hoveredId) ?? null

  const cell = (a: AgentSession) => (
    <button
      key={a.session}
      type="button"
      data-hover={`agent:${a.session}`}
      data-hover-height={cardHeight}
      className={`bar-agent bar-agent-${a.state}`}
      onMouseEnter={() => hover.enter(`agent:${a.session}`, cardHeight)}
      onClick={() => onJump?.(a.session)}
    >
      {agentGlyph(a.state)}
    </button>
  )

  return (
    <div
      className="bar-agents"
      onMouseEnter={hover.stay}
      onMouseLeave={hover.leave}
    >
      {groups.map(([name, list]) => (
        <div key={name} className="bar-agent-group">
          {list.map(cell)}
        </div>
      ))}
      {loose.map(cell)}
      {hovered && (
        <BarCard variant="agent" cardRef={hover.cardRef}>
          <BarCardTitle>{hovered.title || hovered.agent}</BarCardTitle>
          <BarCardLine className={`bar-agent-${hovered.state}`}>
            {agentGlyph(hovered.state)} {agentStateLabel(hovered.state)} ·{' '}
            {agentAge(hovered.updatedAt, now)} ago
          </BarCardLine>
          {hovered.detail && <BarCardDim>{hovered.detail}</BarCardDim>}
          <BarCardDim>{agentLocation(hovered)}</BarCardDim>
          <BarCardHint>click cell to jump</BarCardHint>
        </BarCard>
      )}
    </div>
  )
}

/* ---- battery --------------------------------------------------------- */

const POWER_MODES: [BatteryDetail['powerMode'], string][] = [
  ['low', 'Low power'],
  ['automatic', 'Automatic'],
  ['high', 'High power'],
]

const Stat = ({ label, value }: { label: string; value: string }) => (
  <>
    <span className="bar-card-dim">{label}</span>
    <span className="bar-battery-value">{value}</span>
  </>
)

/**
 * The battery card's body: the facts that don't fit on the strip — capacity,
 * time left, cycles, draw, health, and the active power mode. Power mode is
 * read-only; macOS owns that switch (setting it needs admin auth, which the
 * zero-permissions invariant won't spend).
 */
export function BarBatteryCard({
  detail,
  icon,
  low,
  cardRef,
}: {
  detail: BatteryDetail
  icon?: ReactNode
  low?: boolean
  cardRef?: (el: HTMLElement | null) => void
}) {
  const d = detail
  const watts = d.charging || !d.onAc ? d.batteryWatts : d.systemWatts
  return (
    <BarCard variant="battery" cardRef={cardRef}>
      <div className="bar-battery-head">
        {icon}
        <div>
          <BarCardTitle>Battery</BarCardTitle>
          <div className="bar-card-dim bar-battery-state">
            {batteryState(d)}
          </div>
        </div>
        <div className="bar-battery-pct">{d.pct}%</div>
      </div>
      <div className="bar-battery-track">
        <div
          className={`bar-battery-fill ${low ? 'bar-battery-fill-low' : ''}`}
          style={{ width: `${d.pct ?? 0}%` }}
        />
      </div>
      <div className="bar-battery-grid">
        {d.capacityWh != null && (
          <Stat label="Battery size" value={`${Math.round(d.capacityWh)}Wh`} />
        )}
        {d.minutesRemaining != null && (
          <Stat
            label={d.charging ? 'Time to full' : 'Time left'}
            value={timeLeft(d.minutesRemaining)}
          />
        )}
        {d.cycleCount != null && (
          <Stat label="Charge cycles" value={`${d.cycleCount}`} />
        )}
        {watts != null && watts !== 0 && (
          <Stat
            label={
              d.charging ? 'Charging' : d.onAc ? 'System draw' : 'Discharging'
            }
            value={`${Math.abs(watts).toFixed(1)}W`}
          />
        )}
        {d.healthPct != null && (
          <Stat label="Health" value={`${d.healthPct}%`} />
        )}
      </div>
      {d.powerMode && (
        <>
          <BarCardSection>Power profile</BarCardSection>
          <div className="bar-battery-modes">
            {POWER_MODES.map(([mode, label]) => (
              <span
                key={label}
                className={`bar-battery-mode ${mode === d.powerMode ? 'bar-battery-mode-on' : ''}`}
              >
                {label}
              </span>
            ))}
          </div>
        </>
      )}
      <BarCardHint>click cell for Battery settings</BarCardHint>
    </BarCard>
  )
}

/**
 * The battery cell and its card. `detail` is fetched by the consumer and only
 * while the card is open — the desktop spawns `ioreg`/`pmset` on hover, never
 * on the 1 Hz snapshot path. The card leans on the live snapshot for
 * percent/state so it never lags the strip it hangs from.
 */
export function BarBatteryCell({
  pct,
  onAc,
  charging,
  detail,
  hover,
  cardHeight = 250,
  onClick,
}: {
  pct: number | null
  onAc: boolean
  charging: boolean
  detail: BatteryDetail | null
  hover: BarHoverApi
  cardHeight?: number
  onClick?: () => void
}) {
  const Icon = batteryIcon(pct, onAc, charging)

  if (pct == null) {
    // Desktop Mac: no pack to report on, so no card either.
    return onAc ? (
      <BarCell>
        <Icon {...ICON_PROPS} />
        AC
      </BarCell>
    ) : null
  }

  const tone = batteryTone(pct, onAc, charging)
  const live = detail && { ...detail, pct, onAc, charging }

  return (
    <BarHoverCell
      id="battery"
      cardHeight={cardHeight}
      hover={hover}
      className={toneClass(tone)}
      wrapperClassName="bar-battery"
      onClick={onClick}
      card={
        live && (
          <BarBatteryCard
            detail={live}
            icon={<Icon size={20} strokeWidth={2.2} aria-hidden />}
            low={tone === 'danger'}
            cardRef={hover.cardRef}
          />
        )
      }
    >
      <Icon {...ICON_PROPS} />
      {pct}%
    </BarHoverCell>
  )
}

/** SSID when online, an alarmed "Offline" when not. */
export function BarWifiCell({
  online,
  ssid,
}: {
  online: boolean
  ssid: string | null
}) {
  return (
    <BarCell
      className={`bar-cell ${online ? '' : 'bar-danger'}`}
      title={ssid ?? undefined}
    >
      {online ? <Wifi {...ICON_PROPS} /> : <WifiOff {...ICON_PROPS} />}
      {online ? (ssid ?? 'SSID hidden') : 'Offline'}
    </BarCell>
  )
}

/** TRMNL device battery. A missing reading is an error state, not a blank. */
export function BarTrmnlCell({
  pct,
  name,
}: {
  pct: number | null
  name: string | null
}) {
  return (
    <BarCell className={toneClass(trmnlTone(pct))} title={name ?? 'TRMNL'}>
      ▣ {pct != null ? `${pct}%` : '--'}
    </BarCell>
  )
}

export type { AgentSession, BarHoverApi, BarSnapshot, BatteryDetail }
