import { describe, expect, it } from 'vitest'

import { SEED_FRECENCY } from './launch-index'
import { frecencyMultiplier } from './ranking'
import { computeRows } from './rows'

describe('frecencyMultiplier', () => {
  it('is 1 for zero or missing frecency', () => {
    expect(frecencyMultiplier(0)).toBe(1)
    expect(frecencyMultiplier(undefined)).toBe(1)
  })

  it('grows with frecency but stays below 1.5', () => {
    expect(frecencyMultiplier(5)).toBeGreaterThan(1)
    expect(frecencyMultiplier(1000)).toBeLessThan(1.5)
  })
})

describe('computeRows', () => {
  it('returns no rows for an empty query', () => {
    expect(computeRows('', SEED_FRECENCY)).toEqual([])
  })

  it('returns no rows in bang mode', () => {
    expect(computeRows('!git status', SEED_FRECENCY)).toEqual([])
  })

  it('ranks Ghostty first for "gho"', () => {
    const rows = computeRows('gho', SEED_FRECENCY)
    expect(rows[0]!.title).toBe('Ghostty')
  })

  it('finds Visual Studio Code via its vscode alias', () => {
    const rows = computeRows('vsc', SEED_FRECENCY)
    expect(rows.map((r) => r.title)).toContain('Visual Studio Code')
  })

  it('caps results at 8', () => {
    const rows = computeRows('a', SEED_FRECENCY)
    expect(rows.length).toBeLessThanOrEqual(8)
  })

  it('falls back to a Google search row when nothing matches', () => {
    const rows = computeRows('zzzz not a thing', SEED_FRECENCY)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.title).toContain('Search Google for')
  })

  it('shows a quicklink row for a trigger query', () => {
    const rows = computeRows('yt cute otters', SEED_FRECENCY)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.hint).toBe('quicklink')
    expect(rows[0]!.title).toContain('cute otters')
  })

  it('boosts a frecent item over an equal-scored rival', () => {
    const cold = computeRows('ghostty', {})
    const warm = computeRows('ghostty', { 'app:ghostty': 12 })
    expect(warm[0]!.title).toBe('Ghostty')
    expect(cold[0]!.title).toBe('Ghostty')
  })
})
