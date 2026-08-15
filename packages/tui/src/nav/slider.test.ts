import { describe, expect, it } from 'vitest'

import { sliderRatio, stepValue } from './slider'

describe('stepValue', () => {
  it('steps by the given number of increments and clamps', () => {
    expect(stepValue(30, 0, 100, 5, 1)).toBe(35)
    expect(stepValue(30, 0, 100, 5, -2)).toBe(20)
    expect(stepValue(98, 0, 100, 5, 1)).toBe(100)
    expect(stepValue(2, 0, 100, 5, -1)).toBe(0)
  })

  it('snaps off-step values onto the step lattice', () => {
    expect(stepValue(33, 0, 100, 5, 1)).toBe(35)
    expect(stepValue(33, 0, 100, 5, -1)).toBe(30)
  })

  it('handles fractional steps', () => {
    expect(stepValue(0.5, 0, 1, 0.1, 1)).toBeCloseTo(0.6)
  })
})

describe('sliderRatio', () => {
  it('maps value to 0..1 and clamps', () => {
    expect(sliderRatio(30, 0, 100)).toBe(0.3)
    expect(sliderRatio(-5, 0, 100)).toBe(0)
    expect(sliderRatio(500, 0, 100)).toBe(1)
    expect(sliderRatio(5, 5, 5)).toBe(0)
  })
})
