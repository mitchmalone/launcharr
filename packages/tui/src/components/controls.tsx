import { useRef } from 'react'
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react'

import { sliderRatio, stepValue } from '../nav/slider'

/** Square two-state switch (the Omarchy toggle: knob slides left/right). */
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`tui-toggle ${checked ? 'tui-toggle-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="tui-toggle-knob" />
    </button>
  )
}

/** Keyboard-first horizontal slider: arrows step, click/drag seeks. */
export function Slider({
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  label,
}: {
  value: number
  min?: number
  max?: number
  step?: number
  onChange: (value: number) => void
  label?: string
}) {
  const track = useRef<HTMLDivElement>(null)

  const seek = (event: PointerEvent) => {
    const rect = track.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return
    const ratio = (event.clientX - rect.left) / rect.width
    const raw = min + ratio * (max - min)
    onChange(stepValue(raw, min, max, step, 0))
  }

  const onKeyDown = (event: KeyboardEvent) => {
    const deltas: Record<string, number> = {
      ArrowRight: 1,
      ArrowUp: 1,
      ArrowLeft: -1,
      ArrowDown: -1,
      PageUp: 10,
      PageDown: -10,
    }
    const delta = deltas[event.key]
    if (delta === undefined) return
    event.preventDefault()
    onChange(stepValue(value, min, max, step, delta))
  }

  const ratio = sliderRatio(value, min, max)
  return (
    <div
      className="tui-slider"
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        seek(e)
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) seek(e)
      }}
    >
      <div ref={track} className="tui-slider-track">
        <div className="tui-slider-fill" style={{ width: `${ratio * 100}%` }} />
        <div className="tui-slider-knob" style={{ left: `${ratio * 100}%` }} />
      </div>
    </div>
  )
}

/** Bordered button row (DHCP | Cloudflare | Google | Custom). */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: ReactNode }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="tui-segmented" role="radiogroup">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={opt.value === value}
          className={`tui-segment ${opt.value === value ? 'tui-segment-active' : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

/** Thin labeled meter (memento mori, tokens-by-day): label · track · value. */
export function MeterRow({
  label,
  value,
  max = 1,
  right,
  emphasis = false,
}: {
  label?: ReactNode
  value: number
  max?: number
  right?: ReactNode
  emphasis?: boolean
}) {
  const ratio = sliderRatio(value, 0, max)
  return (
    <div className={`tui-meter ${emphasis ? 'tui-meter-emphasis' : ''}`}>
      {label != null && <span className="tui-meter-label">{label}</span>}
      <span className="tui-meter-track">
        <span className="tui-meter-fill" style={{ width: `${ratio * 100}%` }} />
      </span>
      {right != null && <span className="tui-meter-right">{right}</span>}
    </div>
  )
}
