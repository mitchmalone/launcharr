import { describe, expect, it } from 'vitest'

import { frecencyMultiplier, rank } from './ranking'
import type { IndexItem } from './types'

function app(name: string, aliases: string[] = []): IndexItem {
  return {
    id: `/Applications/${name}.app`,
    name,
    kind: 'app',
    path: `/Applications/${name}.app`,
    hint: 'app',
    icon: null,
    aliases,
  }
}

const ITEMS: IndexItem[] = [
  app('Safari'),
  app('Slack'),
  app('System Settings', ['preferences', 'settings']),
  app('Sublime Text'),
  app('Spotify'),
]

describe('frecencyMultiplier', () => {
  it('is 1 for unknown or zero frecency', () => {
    expect(frecencyMultiplier(undefined)).toBe(1)
    expect(frecencyMultiplier(0)).toBe(1)
  })

  it('grows with frecency but is hard-capped below 2', () => {
    const low = frecencyMultiplier(1)
    const high = frecencyMultiplier(1000)
    expect(low).toBeGreaterThan(1)
    expect(high).toBeGreaterThan(low)
    expect(high).toBeLessThan(2)
  })
})

describe('rank', () => {
  it('empty query returns nothing — no guessing (PRD cold start)', () => {
    expect(rank('', ITEMS, {})).toEqual([])
  })

  it('cold start falls back to pure fuzzy order', () => {
    const results = rank('sa', ITEMS, {})
    expect(results[0]!.item.name).toBe('Safari')
  })

  it('frecency settles near-ties', () => {
    const cold = rank('s', ITEMS, {})
    const warm = rank('s', ITEMS, { '/Applications/Spotify.app': 10 })
    expect(cold.map((r) => r.item.name)).not.toEqual(
      warm.map((r) => r.item.name),
    )
    expect(warm[0]!.item.name).toBe('Spotify')
  })

  it('a few days of launches flips a near-tie (code → VS Code over Codex)', () => {
    const editors = [app('Codex'), app('Visual Studio Code')]
    const cold = rank('code', editors, {})
    expect(cold[0]!.item.name).toBe('Codex')
    // Five launches inside the 5-day window (frecency.rs counts 1.0 each).
    const warm = rank('code', editors, {
      '/Applications/Visual Studio Code.app': 5,
    })
    expect(warm[0]!.item.name).toBe('Visual Studio Code')
  })

  it('a weak textual match cannot outrank an obviously better one (PRD §5.3)', () => {
    // A scattered mid-word match stays below a clean consecutive one, even with
    // unbounded frecency behind it — the multiplier cap is the mechanism.
    const results = rank('saf', [...ITEMS, app('Distressed Anchor Forge')], {
      '/Applications/Distressed Anchor Forge.app': 10_000,
    })
    expect(results[0]!.item.name).toBe('Safari')
  })

  it('matches aliases (preferences → System Settings) without highlight positions', () => {
    const results = rank('preferences', ITEMS, {})
    expect(results[0]!.item.name).toBe('System Settings')
    expect(results[0]!.positions).toEqual([])
  })

  it('caps results at 8', () => {
    const many = Array.from({ length: 20 }, (_, i) => app(`Sketch ${i}`))
    expect(rank('sk', many, {}).length).toBe(8)
  })

  it('non-matching items are excluded entirely', () => {
    const results = rank('zzz', ITEMS, {})
    expect(results).toEqual([])
  })
})
