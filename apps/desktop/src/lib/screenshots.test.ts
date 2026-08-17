import { describe, expect, it } from 'vitest'

import { type Screenshot, filterScreenshots, relativeAge } from './screenshots'

const NOW = 1_755_400_000_000

describe('relativeAge', () => {
  it('reads like a terminal: s, m, h, then weekday, then date', () => {
    expect(relativeAge(NOW - 5_000, NOW)).toBe('now')
    expect(relativeAge(NOW - 90_000, NOW)).toBe('1m')
    expect(relativeAge(NOW - 25 * 60_000, NOW)).toBe('25m')
    expect(relativeAge(NOW - 3 * 3_600_000, NOW)).toBe('3h')
    expect(relativeAge(NOW - 30 * 3_600_000, NOW)).toBe('yesterday')
    expect(relativeAge(NOW - 3 * 86_400_000, NOW)).toMatch(/^[A-Z][a-z]{2}$/)
    expect(relativeAge(NOW - 20 * 86_400_000, NOW)).toMatch(
      /^\d{1,2} [A-Z][a-z]{2,4}$/,
    )
  })
})

describe('filterScreenshots', () => {
  const shots: Screenshot[] = [
    {
      path: '/d/Screenshot 2026-08-17 at 11.53.23.png',
      name: 'Screenshot 2026-08-17 at 11.53.23.png',
      mtimeMs: NOW,
    },
    { path: '/d/slack-thread.png', name: 'slack-thread.png', mtimeMs: NOW - 1 },
    {
      path: '/d/CleanShot 2026-08-10.png',
      name: 'CleanShot 2026-08-10.png',
      mtimeMs: NOW - 2,
    },
  ]
  it('empty query keeps order', () => {
    expect(filterScreenshots(shots, '').map((s) => s.name)).toEqual(
      shots.map((s) => s.name),
    )
  })
  it('fuzzy-matches names, best first', () => {
    expect(filterScreenshots(shots, 'slack')[0]?.name).toBe('slack-thread.png')
    expect(filterScreenshots(shots, '08-10').map((s) => s.name)).toEqual([
      'CleanShot 2026-08-10.png',
    ])
    expect(filterScreenshots(shots, 'zzzz')).toEqual([])
  })
})
