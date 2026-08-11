import { describe, expect, it } from 'vitest'

import { computeDemoRows } from './demo-rows'
import { SEED_FRECENCY } from './launch-index'

/**
 * Adapter tests only: engine behavior (matching, ranking, grammar) is tested in
 * @launcharr/core — these cover the core-row → demo-row translation.
 */
describe('computeDemoRows', () => {
  it('returns no rows for an empty query', () => {
    expect(computeDemoRows('', SEED_FRECENCY)).toEqual([])
  })

  it('returns no rows in bang mode (the banner renders instead)', () => {
    expect(computeDemoRows('!git status', SEED_FRECENCY)).toEqual([])
  })

  it('shows a quicklink row for a trigger query', () => {
    const rows = computeDemoRows('yt cute otters', SEED_FRECENCY)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.hint).toBe('quicklink')
    expect(rows[0]!.title).toContain('cute otters')
    expect(rows[0]!.action).toContain('youtube.com')
  })

  it('ranks Ghostty first for "gho" with its mock icon and bumpable id', () => {
    const rows = computeDemoRows('gho', SEED_FRECENCY)
    expect(rows[0]!.title).toBe('Ghostty')
    expect(rows[0]!.glyph).toBe('👻')
    expect(rows[0]!.id).toBe('app:ghostty')
  })

  it('lets frecency reorder equal-scored matches', () => {
    const cold = computeDemoRows('m', {})
    const warm = computeDemoRows('m', { 'app:music': 50 })
    expect(cold[0]!.title).toBe('Mail')
    expect(warm[0]!.title).toBe('Music')
  })

  it('surfaces the engine URL row for a URL-ish query', () => {
    const rows = computeDemoRows('github.com', {})
    expect(rows[0]!.title).toBe('Open github.com')
    expect(rows[0]!.action).toBe('opened github.com')
  })

  it('surfaces the engine math row with a copy action', () => {
    const rows = computeDemoRows('2+2', {})
    expect(rows[0]!.title).toBe('= 4')
    expect(rows[0]!.action).toBe('copied 4')
  })

  it('surfaces real emoji rows in emoji mode', () => {
    const rows = computeDemoRows(':fire', {})
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0]!.action).toMatch(/^copied /)
  })

  it('falls back to a search row when nothing matches', () => {
    const rows = computeDemoRows('zzzz not a thing', SEED_FRECENCY)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.title).toContain('Search Google for')
    expect(rows[0]!.action).toContain('google.com')
  })
})
