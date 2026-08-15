import type { KeyboardEvent, ReactNode } from 'react'

/** The bordered charcoal box every surface lives in. */
export function Panel({
  title,
  subtitle,
  icon,
  footer,
  className = '',
  onKeyDown,
  children,
}: {
  title?: ReactNode
  subtitle?: ReactNode
  icon?: ReactNode
  footer?: ReactNode
  className?: string
  onKeyDown?: (event: KeyboardEvent) => void
  children: ReactNode
}) {
  return (
    <div
      className={`tui tui-panel ${className}`}
      tabIndex={onKeyDown ? 0 : undefined}
      onKeyDown={onKeyDown}
    >
      {(title || icon) && (
        <header className="tui-panel-head">
          {icon && <span className="tui-panel-icon">{icon}</span>}
          <div>
            {title && <div className="tui-panel-title">{title}</div>}
            {subtitle && <div className="tui-panel-subtitle">{subtitle}</div>}
          </div>
        </header>
      )}
      <div className="tui-panel-body">{children}</div>
      {footer && <footer className="tui-panel-foot">{footer}</footer>}
    </div>
  )
}

/** Uppercase dim label row, optionally with a right-aligned value. */
export function SectionHeader({
  label,
  right,
}: {
  label: ReactNode
  right?: ReactNode
}) {
  return (
    <div className="tui-section">
      <span>{label}</span>
      {right != null && <span className="tui-section-right">{right}</span>}
    </div>
  )
}

export function Divider() {
  return <div className="tui-divider" />
}

/** A selectable row: optional glyph, label (+sub), right-aligned extra. */
export function ListRow({
  selected = false,
  dim = false,
  icon,
  label,
  sub,
  right,
  onClick,
  onHover,
}: {
  selected?: boolean
  dim?: boolean
  icon?: ReactNode
  label: ReactNode
  sub?: ReactNode
  right?: ReactNode
  onClick?: () => void
  onHover?: () => void
}) {
  const cls = [
    'tui-row',
    selected && 'tui-row-selected',
    dim && 'tui-row-dim',
    onClick && 'tui-row-clickable',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <div className={cls} onClick={onClick} onMouseMove={onHover}>
      {icon && <span className="tui-row-icon">{icon}</span>}
      <span className="tui-row-label">
        {label}
        {sub && <span className="tui-row-sub">{sub}</span>}
      </span>
      {right != null && <span className="tui-row-right">{right}</span>}
    </div>
  )
}

/** Two-column hotkey row: chord left, "→ action" right. */
export function HotkeyRow({
  keys,
  action,
  selected = false,
}: {
  keys: ReactNode
  action: ReactNode
  selected?: boolean
}) {
  return (
    <div className={`tui-row tui-hotkey ${selected ? 'tui-row-selected' : ''}`}>
      <span className="tui-hotkey-keys">{keys}</span>
      <span className="tui-hotkey-action">
        <span className="tui-hotkey-arrow">→</span> {action}
      </span>
    </div>
  )
}

/** Footer hint line: "↔ toggle · enter submit · y Yes". */
export function KeyHints({
  hints,
}: {
  hints: { keys: ReactNode; label: ReactNode }[]
}) {
  return (
    <div className="tui-keyhints">
      {hints.map((h, i) => (
        <span key={i} className="tui-keyhint">
          <span className="tui-keyhint-keys">{h.keys}</span> {h.label}
        </span>
      ))}
    </div>
  )
}

/** Split layout (clipboard manager): list left, preview right. */
export function TwoPane({
  left,
  right,
  ratio = 0.48,
}: {
  left: ReactNode
  right: ReactNode
  ratio?: number
}) {
  return (
    <div
      className="tui-twopane"
      style={{
        gridTemplateColumns: `${ratio * 100}fr 1px ${(1 - ratio) * 100}fr`,
      }}
    >
      <div className="tui-twopane-left">{left}</div>
      <div className="tui-twopane-rule" />
      <div className="tui-twopane-right">{right}</div>
    </div>
  )
}

/** Borderless prompt input ("Search clipboard…", "> Git repo URL"). */
export function TextPrompt({
  value,
  onChange,
  placeholder,
  sigil,
  autoFocus = false,
  onKeyDown,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  sigil?: ReactNode
  autoFocus?: boolean
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void
}) {
  return (
    <div className="tui-prompt">
      {sigil && <span className="tui-prompt-sigil">{sigil}</span>}
      <input
        className="tui-prompt-input"
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
      />
    </div>
  )
}
