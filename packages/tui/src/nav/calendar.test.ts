import { describe, expect, it } from 'vitest'

import { isoWeek, monthGrid, stepMonth, yearProgress } from './calendar'

describe('isoWeek', () => {
  it('matches known ISO week numbers', () => {
    expect(isoWeek(new Date(2026, 7, 14))).toBe(33) // Fri Aug 14 2026
    expect(isoWeek(new Date(2026, 0, 1))).toBe(1) // Thu Jan 1 2026
    expect(isoWeek(new Date(2027, 0, 1))).toBe(53) // Fri Jan 1 2027 → week 53 of 2026
    expect(isoWeek(new Date(2024, 11, 30))).toBe(1) // Mon Dec 30 2024 → week 1 of 2025
  })
})

describe('monthGrid', () => {
  // Reference: the Omarchy calendar screenshot — August 2026, Sunday-start,
  // rows Jul 26 … Sep 5, ISO week column reading 31–36.
  const grid = monthGrid(2026, 7)

  it('covers the month in full weeks', () => {
    expect(grid.weeks).toHaveLength(6)
    const first = grid.weeks[0]!.days[0]!
    const last = grid.weeks[5]!.days[6]!
    expect([first.month, first.date]).toEqual([6, 26])
    expect([last.month, last.date]).toEqual([8, 5])
  })

  it('labels rows with ISO week numbers', () => {
    expect(grid.weeks.map((w) => w.isoWeek)).toEqual([31, 32, 33, 34, 35, 36])
  })

  it('marks out-of-month days', () => {
    expect(grid.weeks[0]!.days[0]!.inMonth).toBe(false)
    expect(grid.weeks[0]!.days[6]!.inMonth).toBe(true) // Aug 1
    expect(grid.weeks[2]!.days[5]!.date).toBe(14) // Friday column
  })

  it('supports Monday start', () => {
    const mon = monthGrid(2026, 7, 'mon')
    expect(mon.weeks[0]!.days[0]!.date).toBe(27) // Mon Jul 27
    expect(mon.weeks[0]!.isoWeek).toBe(31)
  })
})

describe('stepMonth', () => {
  it('steps and wraps across year boundaries', () => {
    expect(stepMonth(2026, 7, 1)).toEqual({ year: 2026, month: 8 })
    expect(stepMonth(2026, 11, 1)).toEqual({ year: 2027, month: 0 })
    expect(stepMonth(2026, 0, -1)).toEqual({ year: 2025, month: 11 })
    expect(stepMonth(2026, 7, -20)).toEqual({ year: 2024, month: 11 })
  })
})

describe('yearProgress', () => {
  it('is ~62% mid-August and boundary-sane', () => {
    expect(yearProgress(new Date(2026, 7, 14))).toBeCloseTo(0.62, 1)
    expect(yearProgress(new Date(2026, 0, 1))).toBeCloseTo(0, 2)
    expect(yearProgress(new Date(2026, 11, 31))).toBeCloseTo(1, 2)
  })
})
