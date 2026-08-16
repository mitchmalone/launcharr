import { describe, expect, it } from 'vitest'

import { fmtReset, fmtTokens } from './UsagePanel'

describe('fmtTokens', () => {
  it('scales with one trimmed decimal', () => {
    expect(fmtTokens(218_234_567)).toBe('218.2M')
    expect(fmtTokens(927_000_000)).toBe('927M')
    expect(fmtTokens(1_600)).toBe('1.6k')
    expect(fmtTokens(2_100_000_000)).toBe('2.1B')
    expect(fmtTokens(42)).toBe('42')
    expect(fmtTokens(0)).toBe('0')
  })
})

describe('fmtReset', () => {
  it('counts down in the largest sensible unit', () => {
    expect(fmtReset(1_000_345_600, 1_000_000_000)).toBe('resets in 4d')
    expect(fmtReset(1_000_007_200, 1_000_000_000)).toBe('resets in 2h')
    expect(fmtReset(1_000_000_300, 1_000_000_000)).toBe('resets in 5m')
    expect(fmtReset(999_999_999, 1_000_000_000)).toBe('resets soon')
    expect(fmtReset(null, 1_000_000_000)).toBe('')
  })
})
