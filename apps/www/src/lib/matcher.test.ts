import { describe, expect, it } from 'vitest'

import { fuzzyMatch } from './matcher'

describe('fuzzyMatch', () => {
  it('returns zero score and no positions for an empty query', () => {
    expect(fuzzyMatch('', 'Ghostty')).toEqual({ score: 0, positions: [] })
  })

  it('returns null when the query is longer than the target', () => {
    expect(fuzzyMatch('ghostty!', 'ghost')).toBeNull()
  })

  it('returns null when characters are missing from the target', () => {
    expect(fuzzyMatch('xyz', 'Ghostty')).toBeNull()
  })

  it('matches case-insensitively and reports positions', () => {
    const m = fuzzyMatch('gho', 'Ghostty')
    expect(m).not.toBeNull()
    expect(m!.positions).toEqual([0, 1, 2])
  })

  it('scores a prefix match above a scattered match', () => {
    const prefix = fuzzyMatch('gho', 'Ghostty')!
    const scattered = fuzzyMatch('gho', 'gizmo hero photo')!
    expect(prefix.score).toBeGreaterThan(scattered.score)
  })

  it('rewards word-boundary matches (vsc → Visual Studio Code)', () => {
    const m = fuzzyMatch('vsc', 'Visual Studio Code')
    expect(m).not.toBeNull()
    expect(m!.positions).toEqual([0, 7, 14])
  })

  it('rewards camelCase boundaries', () => {
    const camel = fuzzyMatch('m', 'aMz')!
    const flat = fuzzyMatch('m', 'amz')!
    expect(camel.score).toBeGreaterThan(flat.score)
  })
})
