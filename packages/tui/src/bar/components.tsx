import {
  BatteryCharging,
  BatteryFull,
  BatteryLow,
  BatteryMedium,
  BatteryWarning,
  Coffee,
  WifiOff,
} from 'lucide-react'
import { DynamicIcon, type IconName } from 'lucide-react/dynamic'
import type { ReactNode } from 'react'

import {
  agentAge,
  agentGlyph,
  agentLocation,
  agentStateLabel,
  batteryLook,
  batteryState,
  groupAgents,
  timeLeft,
  toneClass,
  widgetHealth,
  widgetToneClass,
  wifiBars,
  wifiSignalLabel,
  wifiTone,
} from './format'
import type {
  AgentSession,
  AwakeHolder,
  BarHoverApi,
  BarSnapshot,
  BarWidget,
  BatteryDetail,
  WidgetAction,
  WifiDetail,
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

/** Landscape glyphs (battery ≈ 20×12, wifi ≈ 20×15 of lucide's 24-box) get a
 * bigger box so their *visual* height lands where the squarer icons' does —
 * at a flat 14 they read as squat beside the coffee cup (Mitch, 2026-08-19).
 * Optical sizing, not a different icon. */
export const WIDE_ICON_PROPS = { ...ICON_PROPS, size: 17 } as const

/** Which battery glyph a reading gets. Lives here so no consumer re-derives it. */
/** The lucide icon for a battery glyph tier (format.ts `batteryLook`). */
export const BATTERY_ICONS = {
  charging: BatteryCharging,
  full: BatteryFull,
  medium: BatteryMedium,
  low: BatteryLow,
  warning: BatteryWarning,
} as const

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
 * by tab. Agents outside tmux share one dashed box — same shape, different
 * texture, so "no pane" reads as a place rather than as a stuck cell.
 * Hovering opens a dropdown card with the agent's task, state and tmux
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
      {a.subagents.length > 0 && (
        <span className="bar-agent-subs">{a.subagents.length}</span>
      )}
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
      {loose.length > 0 && (
        <div className="bar-agent-group bar-agent-group-loose">
          {loose.map(cell)}
        </div>
      )}
      {hovered && (
        <BarCard variant="agent" cardRef={hover.cardRef}>
          <BarCardTitle>{hovered.title || hovered.agent}</BarCardTitle>
          <BarCardLine className={`bar-agent-${hovered.state}`}>
            {agentGlyph(hovered.state)} {agentStateLabel(hovered.state)} ·{' '}
            {agentAge(hovered.updatedAt, now)} ago
          </BarCardLine>
          {hovered.detail && <BarCardDim>{hovered.detail}</BarCardDim>}
          <BarCardDim>{agentLocation(hovered)}</BarCardDim>
          {hovered.subagents.length > 0 && (
            <div className="bar-card-subagents">
              {hovered.subagents.map((sub) => (
                <BarCardDim key={sub.id}>
                  ⑂ {sub.kind}
                  {sub.description && ` · ${sub.description}`} ·{' '}
                  {agentAge(sub.startedAt, now)}
                </BarCardDim>
              ))}
            </div>
          )}
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
            {d.chargeLimit != null &&
              d.chargeLimit < 100 &&
              ` · limit ${d.chargeLimit}%`}
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
          <BarCardSection>Power mode</BarCardSection>
          {/* Read-only, so it must not read as buttons (Mitch, 2026-08-17):
              plain text, the active mode lit, the others dim. */}
          <div className="bar-battery-modes">
            {POWER_MODES.map(([mode, label], i) => (
              <span key={label} className="bar-battery-mode-item">
                {i > 0 && <span className="bar-battery-mode-sep">·</span>}
                <span
                  className={`bar-battery-mode ${mode === d.powerMode ? 'bar-battery-mode-on' : ''}`}
                >
                  {label}
                </span>
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
  chargeLimit = null,
  detail,
  hover,
  cardHeight = 250,
  onClick,
}: {
  pct: number | null
  onAc: boolean
  charging: boolean
  /** The user's charge limit (e.g. 80) — the strip judges fullness against it. */
  chargeLimit?: number | null
  detail: BatteryDetail | null
  hover: BarHoverApi
  cardHeight?: number
  onClick?: () => void
}) {
  if (pct == null) {
    // Desktop Mac: no pack to report on, so no card either.
    return onAc ? (
      <BarCell>
        <BatteryCharging {...WIDE_ICON_PROPS} />
        AC
      </BarCell>
    ) : null
  }

  // Glyph only — colour and lucide tier carry the level; the number shows
  // only in the red tier (minimal is the theme, 2026-08-19).
  const look = batteryLook(pct, charging, chargeLimit, onAc)
  const Icon = BATTERY_ICONS[look.glyph]
  const live = detail && { ...detail, pct, onAc, charging, chargeLimit }

  return (
    <BarHoverCell
      id="battery"
      cardHeight={cardHeight}
      hover={hover}
      className={`bar-cell bar-battery-${look.tone}`}
      wrapperClassName="bar-battery"
      onClick={onClick}
      card={
        live && (
          <BarBatteryCard
            detail={live}
            icon={<Icon size={20} strokeWidth={2.2} aria-hidden />}
            low={look.tone === 'danger'}
            cardRef={hover.cardRef}
          />
        )
      }
    >
      <Icon {...WIDE_ICON_PROPS} />
      {look.showPct && `${pct}%`}
    </BarHoverCell>
  )
}

/* ---- awake ------------------------------------------------------------ */

/**
 * The keep-awake card: what stays on, how the session ends, and who else is
 * holding the Mac awake. All strings arrive as props — the words are product
 * copy owned by @launcharr/core/awake, composed by each consumer.
 */
export function BarAwakeCard({
  armed,
  holdLabel,
  endsLabel,
  elapsed,
  remaining,
  others,
  cardRef,
}: {
  armed: boolean
  /** e.g. "Mac awake, screen can sleep". */
  holdLabel: string | null
  /** e.g. "until agents idle". */
  endsLabel: string | null
  /** e.g. "42m". */
  elapsed: string | null
  /** e.g. "1h 18m left", for deadline sessions. */
  remaining: string | null
  others: AwakeHolder[]
  cardRef?: (el: HTMLElement | null) => void
}) {
  return (
    <BarCard variant="awake" cardRef={cardRef}>
      <BarCardTitle>Awake</BarCardTitle>
      {armed ? (
        <>
          {holdLabel && <BarCardLine>{holdLabel}</BarCardLine>}
          <BarCardDim>
            {[endsLabel, elapsed && `on ${elapsed}`, remaining]
              .filter(Boolean)
              .join(' · ')}
          </BarCardDim>
        </>
      ) : (
        <BarCardDim>sleeping normally</BarCardDim>
      )}
      {others.length > 0 && (
        <>
          <BarCardSection>Also keeping this Mac awake</BarCardSection>
          {others.map((h) => (
            <BarCardLine key={h.app} className="bar-awake-holder">
              <span>{h.app}</span>
              <span className="bar-awake-holder-time">
                {formatHold(h.seconds)}
              </span>
            </BarCardLine>
          ))}
        </>
      )}
      <BarCardHint>
        {armed ? 'click cell to turn off' : 'awake ⏎ to start'}
      </BarCardHint>
    </BarCard>
  )
}

/** "4h 12m" / "22m" / "40s" for the holders list. */
export function formatHold(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.round(seconds / 60)
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`
}

/**
 * The awake cell: a coffee cup, dim while the Mac sleeps normally, lit while
 * a session holds it awake — glyph only; elapsed/remaining live in the card
 * (minimal is the theme, 2026-08-19). Clicking an armed cell releases the
 * session — the same promise the panel's ⏎ makes.
 */
export function BarAwakeCell({
  armed,
  hover,
  cardHeight = 150,
  onRelease,
  card,
}: {
  armed: boolean
  hover: BarHoverApi
  cardHeight?: number
  onRelease?: () => void
  card?: ReactNode
}) {
  return (
    <BarHoverCell
      id="awake"
      cardHeight={cardHeight}
      hover={hover}
      className={armed ? 'bar-cell bar-awake-on' : 'bar-cell bar-awake-off'}
      wrapperClassName="bar-awake"
      onClick={armed ? onRelease : undefined}
      card={card}
    >
      <Coffee {...ICON_PROPS} />
    </BarHoverCell>
  )
}

/** SSID when online, an alarmed "Offline" when not. */
/**
 * The wifi card: what `dns ⏎` shows, hanging off the cell instead (Notion
 * "DNS → Wifi Hover", 2026-08-17). `detail` is fetched by the consumer on hover
 * only — the desktop spawns `ipconfig`/`networksetup` then, never at 1 Hz.
 */
export function BarWifiCard({
  detail,
  ssid,
  rssi = null,
  online,
  cardRef,
}: {
  detail: WifiDetail | null
  ssid: string | null
  rssi?: number | null
  online: boolean
  cardRef?: (el: HTMLElement | null) => void
}) {
  const d = detail
  const signal = online ? wifiSignalLabel(rssi) : ''
  return (
    <BarCard variant="wifi" cardRef={cardRef}>
      <div className="bar-wifi-head">
        <WifiGlyph online={online} rssi={rssi} size={20} />
        <div>
          <BarCardTitle>
            {online ? (ssid ?? 'SSID hidden') : 'Wi-Fi offline'}
          </BarCardTitle>
          <div className="bar-card-dim bar-wifi-state">
            {online ? 'connected' : 'no connection'}
            {signal ? ` · ${signal}` : ''}
            {d?.iface ? ` · ${d.iface}` : ''}
          </div>
        </div>
      </div>
      <div className="bar-wifi-grid">
        <Stat label="IP address" value={d ? (d.ip ?? '—') : '…'} />
        <Stat label="Router" value={d ? (d.router ?? '—') : '…'} />
        <Stat label="DNS" value={d ? (d.dns ?? '—') : '…'} />
        <Stat label="Interface" value={d ? (d.iface ?? '—') : '…'} />
      </div>
      {d?.dns === '100.100.100.100' && (
        <div className="bar-card-dim bar-wifi-note">
          100.100.100.100 is Tailscale MagicDNS
        </div>
      )}
      <BarCardHint>wifi ⏎ networks · dns ⏎ details</BarCardHint>
    </BarCard>
  )
}

/* Lucide's `wifi` paths, dot first then arcs inner → outer. Lucide's own
 * tiers (WifiHigh/Low/Zero) *drop* the outer arcs, so a weaker link drew a
 * smaller glyph inside the same box — it read as a shrunk icon, not a
 * weaker one (Mitch, 2026-08-19). We draw all four every time and ghost the
 * lost arcs instead, so the footprint matches the other cells. */
const WIFI_ARCS = [
  'M8.5 16.429a5 5 0 0 1 7 0',
  'M5 12.859a10 10 0 0 1 14 0',
  'M2 8.82a15 15 0 0 1 20 0',
] as const

/**
 * The Wi-Fi strength glyph: lucide's four-arc wifi with the arcs above the
 * RSSI band ghosted. Same size/stroke props as every other cell icon.
 */
export function WifiStrengthIcon({
  bars,
  size = ICON_PROPS.size,
  strokeWidth = ICON_PROPS.strokeWidth,
  className,
}: {
  bars: 1 | 2 | 3 | 4
  size?: number
  strokeWidth?: number
  className?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 20h.01" />
      {WIFI_ARCS.map((d, i) => (
        <path key={d} d={d} opacity={i + 2 <= bars ? 1 : 0.25} />
      ))}
    </svg>
  )
}

/** The Wi-Fi glyph as a strength indicator; offline is lucide's WifiOff. */
function WifiGlyph({
  online,
  rssi,
  size = WIDE_ICON_PROPS.size,
}: {
  online: boolean
  rssi: number | null
  size?: number
}) {
  if (!online) return <WifiOff {...ICON_PROPS} size={size} />
  return <WifiStrengthIcon bars={wifiBars(rssi)} size={size} />
}

/**
 * The wifi cell — glyph only, a strength indicator (the SSID is card-side:
 * "minimal is the theme", 2026-08-19); with `hover` it opens the wifi card
 * (the site strip and any consumer without hover machinery get the plain
 * cell). Offline reads as an alarmed "Offline"; a poor link tints the arcs warn.
 */
export function BarWifiCell({
  online,
  ssid,
  rssi = null,
  hover,
  detail = null,
  cardHeight = 190,
  onClick,
}: {
  online: boolean
  ssid: string | null
  rssi?: number | null
  hover?: BarHoverApi
  detail?: WifiDetail | null
  cardHeight?: number
  onClick?: () => void
}) {
  const body = (
    <>
      <WifiGlyph online={online} rssi={rssi} />
      {!online && 'Offline'}
    </>
  )
  if (!hover) {
    return (
      <BarCell
        className={toneClass(wifiTone(online, rssi))}
        title={online ? (ssid ?? undefined) : undefined}
      >
        {body}
      </BarCell>
    )
  }
  return (
    <BarHoverCell
      id="wifi"
      cardHeight={cardHeight}
      hover={hover}
      className={toneClass(wifiTone(online, rssi))}
      wrapperClassName="bar-wifi"
      onClick={onClick}
      card={
        <BarWifiCard
          detail={detail}
          ssid={ssid}
          rssi={rssi}
          online={online}
          cardRef={hover.cardRef}
        />
      }
    >
      {body}
    </BarHoverCell>
  )
}

/* ---- widgets (docs/WIDGETS.md) --------------------------------------- */

/** Glyph for a widget: any lucide icon by kebab-case name, `puzzle` if none. */
export function WidgetGlyph({
  name,
  size = ICON_PROPS.size,
}: {
  name: string | null | undefined
  size?: number
}) {
  const props = { ...ICON_PROPS, size }
  return <DynamicIcon name={(name || 'puzzle') as IconName} {...props} />
}

/**
 * A widget's card: the tick's title/subtitle, dot-rows (each optionally a
 * click), a hint, and — when the last tick failed — the health line. Purely
 * what the widget said, styled once here.
 */
export function BarWidgetCard({
  widget,
  now,
  onAction,
  cardRef,
}: {
  widget: BarWidget
  now: Date
  onAction?: (action: WidgetAction) => void
  cardRef?: (el: HTMLElement | null) => void
}) {
  const view = widget.view
  const card = view?.card
  const health = widgetHealth(widget.error, widget.lastOk, now)
  const rows = card?.rows ?? []
  return (
    <BarCard variant="widget" cardRef={cardRef}>
      <div className="bar-widget-head">
        <WidgetGlyph name={view?.icon ?? widget.icon} size={20} />
        <div>
          <BarCardTitle>{card?.title ?? widget.name}</BarCardTitle>
          {card?.subtitle && (
            <div className="bar-card-dim bar-widget-sub">{card.subtitle}</div>
          )}
        </div>
      </div>
      {health && (
        <div className="bar-widget-health bar-tone-error">{health}</div>
      )}
      {rows.length > 0 && (
        <div className="bar-widget-rows">
          {rows.map((row, i) => {
            const body = (
              <>
                {row.dot != null && (
                  <span
                    className={`bar-widget-dot ${widgetToneClass(row.dot)}`}
                  >
                    ●
                  </span>
                )}
                <span className="bar-widget-text">{row.text}</span>
                {row.hint && (
                  <span className="bar-widget-hint">{row.hint}</span>
                )}
              </>
            )
            const action = row.action
            return action && action.type !== 'none' && onAction ? (
              <button
                key={i}
                type="button"
                className="bar-widget-row bar-widget-row-action"
                onClick={() => onAction(action)}
              >
                {body}
              </button>
            ) : (
              <div key={i} className="bar-widget-row">
                {body}
              </div>
            )
          })}
        </div>
      )}
      {(card?.hint || (!view && !health)) && (
        <BarCardHint>{card?.hint ?? 'waiting for the first tick…'}</BarCardHint>
      )}
    </BarCard>
  )
}

/**
 * A user widget's cell: glyph (+ optional short label) in the tick's tone; a
 * failing widget keeps its last view but wears the error tone. With `hover` it
 * opens the widget card; the site strip and other hover-less consumers get
 * the plain cell.
 */
export function BarWidgetCell({
  widget,
  now,
  hover,
  cardHeight = 160,
  onAction,
}: {
  widget: BarWidget
  now: Date
  hover?: BarHoverApi
  cardHeight?: number
  onAction?: (action: WidgetAction) => void
}) {
  const view = widget.view
  if (view?.hidden) return null
  const tone = widget.error ? 'error' : view?.tone
  const className = `bar-cell ${widgetToneClass(tone)}`
  const body = (
    <>
      <WidgetGlyph name={view?.icon ?? widget.icon} />
      {view?.label}
    </>
  )
  if (!hover) {
    return (
      <BarCell className={className} title={widget.name}>
        {body}
      </BarCell>
    )
  }
  const click = view?.click
  return (
    <BarHoverCell
      id={`widget:${widget.id}`}
      cardHeight={cardHeight}
      hover={hover}
      className={className}
      wrapperClassName="bar-widget"
      onClick={
        click && click.type !== 'none' && onAction
          ? () => onAction(click)
          : undefined
      }
      card={
        <BarWidgetCard
          widget={widget}
          now={now}
          onAction={onAction}
          cardRef={hover.cardRef}
        />
      }
    >
      {body}
    </BarHoverCell>
  )
}

export type {
  AgentSession,
  BarHoverApi,
  BarSnapshot,
  BarWidget,
  BatteryDetail,
  WidgetAction,
  WifiDetail,
}
