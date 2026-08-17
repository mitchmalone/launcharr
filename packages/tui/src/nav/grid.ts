/**
 * Grid selection movement for thumbnail walls: ←/→ read across rows, ↑/↓ step a
 * column, edges clamp (no wrap — the bottom edge is where "load more" happens).
 * Pure — components own the state, this owns the arithmetic.
 */

export type GridMove = 'left' | 'right' | 'up' | 'down' | 'home' | 'end'

export function moveGridSelection(
  index: number,
  count: number,
  cols: number,
  move: GridMove,
): number {
  if (count <= 0) return -1
  if (index < 0 || index >= count) return 0
  const last = count - 1
  const step = Math.max(1, cols)
  switch (move) {
    case 'left':
      return Math.max(0, index - 1)
    case 'right':
      return Math.min(last, index + 1)
    case 'up':
      return index - step < 0 ? index : index - step
    case 'down': {
      const rowStart = Math.floor(index / step) * step
      const lastRowStart = Math.floor(last / step) * step
      if (rowStart === lastRowStart) return index
      return Math.min(last, index + step)
    }
    case 'home':
      return 0
    case 'end':
      return last
  }
}
