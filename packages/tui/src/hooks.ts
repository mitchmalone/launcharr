import { useCallback, useState } from 'react'
import type { KeyboardEvent } from 'react'

import { type GridMove, moveGridSelection } from './nav/grid'
import { moveSelection } from './nav/list'

export interface ListNavOptions {
  wrap?: boolean
  /** Enter / Return on the current row. */
  onActivate?: (index: number) => void
  /** Escape, or ArrowLeft when `leftIsBack` — the drill-out gesture. */
  onBack?: () => void
  /** ArrowRight on the current row — the drill-in gesture. */
  onDrillIn?: (index: number) => void
  leftIsBack?: boolean
}

export interface ListNav {
  index: number
  setIndex: (index: number) => void
  onKeyDown: (event: KeyboardEvent) => void
}

/**
 * Keyboard-first list navigation: arrows move, Home/End jump, Enter activates,
 * Escape (and optionally ←) backs out, → drills in. Attach `onKeyDown` to the
 * focused container and render `index` as the selected row.
 */
export function useListNav(count: number, opts: ListNavOptions = {}): ListNav {
  const [rawIndex, setIndex] = useState(0)
  const index = count > 0 ? Math.min(rawIndex, count - 1) : -1
  const { wrap = true, onActivate, onBack, onDrillIn, leftIsBack } = opts

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const move = (delta: number) => {
        event.preventDefault()
        setIndex(moveSelection(index, count, delta, wrap))
      }
      switch (event.key) {
        case 'ArrowDown':
          return move(1)
        case 'ArrowUp':
          return move(-1)
        case 'Home':
          return move(-count)
        case 'End':
          return move(count)
        case 'Enter':
          if (onActivate && index >= 0) {
            event.preventDefault()
            onActivate(index)
          }
          return
        case 'ArrowRight':
          if (onDrillIn && index >= 0) {
            event.preventDefault()
            onDrillIn(index)
          }
          return
        case 'ArrowLeft':
          if (leftIsBack && onBack) {
            event.preventDefault()
            onBack()
          }
          return
        case 'Escape':
          if (onBack) {
            event.preventDefault()
            onBack()
          }
          return
      }
    },
    [index, count, wrap, onActivate, onBack, onDrillIn, leftIsBack],
  )

  return { index, setIndex, onKeyDown }
}

export interface GridNavOptions {
  onActivate?: (index: number, event: KeyboardEvent) => void
  onBack?: () => void
  /** ↓ on the last row — the natural "load more" gesture. */
  onBottom?: () => void
}

/**
 * Keyboard-first 2D navigation for thumbnail grids: arrows move (← → read
 * across rows, ↑ ↓ step a column), Home/End jump, Enter activates (the event is
 * passed so modifiers can pick the action), Escape backs out. Same shape as
 * `useListNav`; the arithmetic lives in `nav/grid.ts`.
 */
export function useGridNav(
  count: number,
  cols: number,
  opts: GridNavOptions = {},
): ListNav {
  const [rawIndex, setIndex] = useState(0)
  const index = count > 0 ? Math.min(rawIndex, count - 1) : -1
  const { onActivate, onBack, onBottom } = opts

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const move = (m: GridMove) => {
        event.preventDefault()
        const next = moveGridSelection(index, count, cols, m)
        if (m === 'down' && next === index && onBottom) onBottom()
        setIndex(next)
      }
      switch (event.key) {
        case 'ArrowDown':
          return move('down')
        case 'ArrowUp':
          return move('up')
        case 'ArrowLeft':
          return move('left')
        case 'ArrowRight':
          return move('right')
        case 'Home':
          return move('home')
        case 'End':
          return move('end')
        case 'Enter':
          if (onActivate && index >= 0) {
            event.preventDefault()
            onActivate(index, event)
          }
          return
        case 'Escape':
          if (onBack) {
            event.preventDefault()
            onBack()
          }
          return
      }
    },
    [index, count, cols, onActivate, onBack, onBottom],
  )

  return { index, setIndex, onKeyDown }
}
