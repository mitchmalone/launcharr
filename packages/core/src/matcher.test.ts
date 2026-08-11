import { describe, expect, it } from 'vitest'

import { fuzzyMatch } from './matcher'

function score(query: string, target: string): number {
  const m = fuzzyMatch(query, target)
  if (!m) throw new Error(`expected ${query} to match ${target}`)
  return m.score
}

describe('fuzzyMatch', () => {
  it('returns null when query is not a subsequence', () => {
    expect(fuzzyMatch('xyz', 'Safari')).toBeNull()
    expect(fuzzyMatch('safari!', 'Safari')).toBeNull()
    expect(fuzzyMatch('aa', 'abc')).toBeNull()
  })

  it('matches case-insensitively', () => {
    expect(fuzzyMatch('SAF', 'safari')).not.toBeNull()
    expect(fuzzyMatch('saf', 'SAFARI')).not.toBeNull()
  })

  it('empty query matches everything with score 0', () => {
    expect(fuzzyMatch('', 'Safari')).toEqual({ score: 0, positions: [] })
  })

  it('reports match positions for highlighting', () => {
    expect(fuzzyMatch('saf', 'Safari')?.positions).toEqual([0, 1, 2])
    // Word-boundary path beats scattered mid-word letters.
    expect(fuzzyMatch('vsc', 'Visual Studio Code')?.positions).toEqual([
      0, 7, 14,
    ])
  })

  it('prefers consecutive runs over scattered letters', () => {
    // 'term': Terminal has it consecutively at the start; 'The Elder Realm' scatters it.
    expect(score('term', 'Terminal')).toBeGreaterThan(
      score('term', 'The Elder Realm'),
    )
  })

  it('prefers prefix matches over mid-word matches', () => {
    expect(score('term', 'Terminal')).toBeGreaterThan(score('term', 'iTerm2'))
  })

  it('rewards word-boundary matches (PRD: syspre → System Preferences)', () => {
    // Boundary S+P beats the same letters buried mid-word.
    expect(score('syspre', 'System Preferences')).toBeGreaterThan(
      score('syspre', 'Ecosystem Presenter Deluxe'),
    )
  })

  it('rewards camel-hump boundaries', () => {
    expect(score('ic', 'iCloud')).toBeGreaterThan(score('ic', 'stoic'))
  })

  it('ps → Photoshop beats a name with a stray p…s (PRD §5.2)', () => {
    expect(score('ps', 'Photoshop')).toBeGreaterThan(
      score('ps', 'Pixelmator Studio Tools'),
    )
  })

  it('penalises wider gaps', () => {
    expect(score('sf', 'Serif')).toBeGreaterThan(
      score('sf', 'Sherlock of Fleet Street'),
    )
  })

  it('saf → Safari scores far above weak subsequence matches', () => {
    expect(score('saf', 'Safari')).toBeGreaterThan(
      2 * score('saf', 'Distressed Anchor Forge'),
    )
  })
})
