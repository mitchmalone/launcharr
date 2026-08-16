import { invoke } from '@tauri-apps/api/core'
import { useEffect, useRef, useState } from 'react'

/**
 * The bar's hover machinery, shared by every cell that opens a dropdown card.
 *
 * Hover arrives from Rust, not AppKit: WebKit won't process hover for a
 * never-active accessory window (JOURNAL 2026-08-16), so bar.rs polls the
 * global cursor and feeds window-local coordinates to `window.__barMouse`.
 * There is exactly one of those, so the hit-test lives here rather than in any
 * one cell: hoverable cells carry `data-hover="<id>"` (plus
 * `data-hover-height` for the card they open) and cards carry `.bar-card`.
 *
 * The strip is 30px, too short for a popover, so the whole bar window grows
 * downward while a card is open — `bar_set_dropdown` with the card's height.
 * `data-hover-height` is the opening guess (no two-step resize in the common
 * case); `cardRef` then measures what the card actually took and corrects it,
 * so a card that grows when its data lands never ends up clipped.
 */
declare global {
  interface Window {
    /** Rust-fed cursor position in CSS px; (-1,-1) = left the bar region. */
    __barMouse?: (x: number, y: number) => void
  }
}

export interface BarHover {
  /** `data-hover` id of the cell whose card is open, if any. */
  hovered: string | null
  /** React's own mouseenter — a second path to the same open. */
  enter: (id: string, height: number) => void
  /** Cursor left a cell or card: close after the usual grace period. */
  leave: () => void
  /** Cursor is still on a cell or card: cancel any pending close. */
  stay: () => void
  /** `ref` for a card's root element — keeps the window tall enough for it. */
  cardRef: (el: HTMLElement | null) => void
}

/** Grace period bridging the pixel gap between the strip and a card. */
const CLOSE_MS = 200
/** Fail-safe if the Rust mouse feed ever stalls with a card open. */
const IDLE_MS = 10_000
/** Growth for a cell that didn't declare one — the agent card's height. */
const DEFAULT_CARD_HEIGHT = 130
/** The strip's own height (bar.rs BAR_HEIGHT), the origin cards measure from. */
const BAR_HEIGHT = 30
/** Slack below a measured card so its border never lands on the window edge. */
const CARD_TAIL = 6

export function useBarHover(): BarHover {
  const [hovered, setHovered] = useState<string | null>(null)
  const closeTimer = useRef<number | null>(null)
  const idleTimer = useRef<number | null>(null)
  const sizer = useRef<ResizeObserver | null>(null)
  /** Last height asked of Rust — resizes are a main-thread hop, don't spam. */
  const sentHeight = useRef(0)
  // The handler below is reinstalled every render and reads `hovered`; the
  // ref keeps the *current* value available to timers and to Rust's feed.
  const hoveredRef = useRef<string | null>(null)
  hoveredRef.current = hovered

  useEffect(
    () => () => {
      delete window.__barMouse
      if (closeTimer.current != null) clearTimeout(closeTimer.current)
      if (idleTimer.current != null) clearTimeout(idleTimer.current)
    },
    [],
  )

  const cancelClose = () => {
    if (closeTimer.current != null) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }
  const close = () => {
    cancelClose()
    if (idleTimer.current != null) clearTimeout(idleTimer.current)
    sizer.current?.disconnect()
    sentHeight.current = 0
    setHovered(null)
    invoke('bar_set_dropdown', { open: false }).catch(console.error)
  }
  const armIdleClose = () => {
    if (idleTimer.current != null) clearTimeout(idleTimer.current)
    idleTimer.current = window.setTimeout(close, IDLE_MS)
  }
  const grow = (height: number) => {
    if (Math.abs(height - sentHeight.current) < 2) return
    sentHeight.current = height
    invoke('bar_set_dropdown', { open: true, height }).catch(console.error)
  }
  const enter = (id: string, height: number) => {
    cancelClose()
    armIdleClose()
    if (hoveredRef.current !== id) {
      // Re-sent on every switch: the next card may be taller than this one.
      grow(height)
      setHovered(id)
    }
  }
  // The card's own bottom edge decides the window height — measured against
  // the viewport (= the strip's top edge), so nesting can't skew it, and
  // re-measured whenever the card resizes as its data arrives.
  const cardRef = (el: HTMLElement | null) => {
    sizer.current?.disconnect()
    if (!el) return
    const measure = () =>
      grow(
        Math.ceil(el.getBoundingClientRect().bottom - BAR_HEIGHT) + CARD_TAIL,
      )
    sizer.current = new ResizeObserver(measure)
    sizer.current.observe(el)
    measure()
  }
  // Arm-once, not reset: the mouse feed repeats while the cursor is outside,
  // and re-arming on every tick would keep the deadline forever in the future.
  const leave = () => {
    if (closeTimer.current != null) return
    closeTimer.current = window.setTimeout(close, CLOSE_MS)
  }
  const stay = () => {
    cancelClose()
    armIdleClose()
  }

  // (-1,-1) = the cursor left the bar's window region entirely.
  window.__barMouse = (x: number, y: number) => {
    if (x < 0) {
      if (hoveredRef.current !== null) leave()
      return
    }
    const el = document.elementFromPoint(x, y)
    const cell = el?.closest('[data-hover]') as HTMLElement | null
    if (cell?.dataset.hover) {
      const height = Number(cell.dataset.hoverHeight)
      enter(cell.dataset.hover, height > 0 ? height : DEFAULT_CARD_HEIGHT)
      if (cell.dataset.hover === hoveredRef.current) stay()
      return
    }
    if (hoveredRef.current === null) return
    if (el?.closest('.bar-card')) stay()
    else leave()
  }

  return { hovered, enter, leave, stay, cardRef }
}
