import { describe, expect, it } from 'vitest'

import { moveGridSelection } from './grid'

// 10 items, 4 columns:
//  0 1 2 3
//  4 5 6 7
//  8 9
describe('moveGridSelection', () => {
  it('moves left and right within a row', () => {
    expect(moveGridSelection(1, 10, 4, 'right')).toBe(2)
    expect(moveGridSelection(2, 10, 4, 'left')).toBe(1)
  })

  it('left/right flow across row edges like a reading order', () => {
    expect(moveGridSelection(3, 10, 4, 'right')).toBe(4)
    expect(moveGridSelection(4, 10, 4, 'left')).toBe(3)
  })

  it('clamps at the ends instead of wrapping', () => {
    expect(moveGridSelection(0, 10, 4, 'left')).toBe(0)
    expect(moveGridSelection(9, 10, 4, 'right')).toBe(9)
  })

  it('moves up and down by a column', () => {
    expect(moveGridSelection(5, 10, 4, 'down')).toBe(9)
    expect(moveGridSelection(9, 10, 4, 'up')).toBe(5)
  })

  it('down onto a short last row lands on its last item; up from row 0 stays', () => {
    expect(moveGridSelection(7, 10, 4, 'down')).toBe(9)
    expect(moveGridSelection(2, 10, 4, 'up')).toBe(2)
  })

  it('down from the last row stays put (the caller loads more)', () => {
    expect(moveGridSelection(9, 10, 4, 'down')).toBe(9)
    expect(moveGridSelection(8, 10, 4, 'down')).toBe(8)
  })

  it('home/end jump; empty grid is -1; out-of-range resets to 0', () => {
    expect(moveGridSelection(5, 10, 4, 'home')).toBe(0)
    expect(moveGridSelection(5, 10, 4, 'end')).toBe(9)
    expect(moveGridSelection(0, 0, 4, 'down')).toBe(-1)
    expect(moveGridSelection(42, 10, 4, 'down')).toBe(0)
  })
})
