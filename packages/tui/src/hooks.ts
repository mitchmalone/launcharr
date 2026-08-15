import { useCallback, useState } from 'react'
import type { KeyboardEvent } from 'react'

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
