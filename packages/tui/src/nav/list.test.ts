import { describe, expect, it } from 'vitest'

import { moveSelection } from './list'

describe('moveSelection', () => {
  it('moves down and up within bounds', () => {
    expect(moveSelection(0, 5, 1)).toBe(1)
    expect(moveSelection(3, 5, -1)).toBe(2)
  })

  it('wraps by default', () => {
    expect(moveSelection(4, 5, 1)).toBe(0)
    expect(moveSelection(0, 5, -1)).toBe(4)
  })

  it('clamps when wrap is off', () => {
    expect(moveSelection(4, 5, 1, false)).toBe(4)
    expect(moveSelection(0, 5, -1, false)).toBe(0)
  })

  it('handles multi-step deltas with wrap', () => {
    expect(moveSelection(4, 5, 3)).toBe(2)
    expect(moveSelection(1, 5, -3)).toBe(3)
  })

  it('returns -1 for empty lists', () => {
    expect(moveSelection(0, 0, 1)).toBe(-1)
    expect(moveSelection(-1, 0, -1)).toBe(-1)
  })

  it('recovers from an out-of-range index', () => {
    expect(moveSelection(99, 5, 1)).toBe(0)
    expect(moveSelection(-1, 5, 1)).toBe(0)
  })
})
