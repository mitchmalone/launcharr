import { describe, expect, it } from 'vitest'

import { draftRows, launchRows, quicklinkRows, searchEngineLabel } from './rows'
import type { IndexItem, Link } from './types'

const GOOGLE = 'https://www.google.com/search?q={query}'

function app(name: string): IndexItem {
  return {
    id: `/Applications/${name}.app`,
    name,
    kind: 'app',
    path: `/Applications/${name}.app`,
    hint: 'app',
    icon: null,
    aliases: [],
  }
}

const ITEMS = [app('Safari'), app('Slack')]

describe('launchRows', () => {
  it('URL-ish query gets an open row on top, above matches', () => {
    const rows = launchRows('safari.com', ITEMS, {}, GOOGLE)
    expect(rows[0]!.enter).toEqual({
      kind: 'open-url',
      url: 'https://safari.com',
    })
    // Safari still matches "safari.com"? No — dots break the subsequence; either way
    // the URL row must be first.
    expect(rows[0]!.key).toBe('url')
  })

  it('search fallback appears ONLY when nothing else matches (Alfred behaviour)', () => {
    const dead = launchRows('zzqx', ITEMS, {}, GOOGLE)
    expect(dead).toHaveLength(1)
    expect(dead[0]!.title).toBe('Search Google for “zzqx”')
    expect(dead[0]!.enter).toEqual({
      kind: 'open-url',
      url: 'https://www.google.com/search?q=zzqx',
    })

    const alive = launchRows('saf', ITEMS, {}, GOOGLE)
    expect(alive.some((r) => r.key === 'search-fallback')).toBe(false)
  })

  it('math row suppresses the search fallback', () => {
    const rows = launchRows('2+2', ITEMS, {}, GOOGLE)
    expect(rows[0]!.key).toBe('math')
    expect(rows.some((r) => r.key === 'search-fallback')).toBe(false)
  })

  it('empty query yields no rows at all', () => {
    expect(launchRows('', ITEMS, {}, GOOGLE)).toEqual([])
    expect(launchRows('   ', ITEMS, {}, GOOGLE)).toEqual([])
  })
})

describe('quicklinkRows', () => {
  const yt: Link = {
    name: 'YouTube',
    trigger: 'yt',
    url: 'https://www.youtube.com/results?search_query={query}',
  }

  it('substitutes the encoded args into the template', () => {
    const rows = quicklinkRows(yt, 'cute otters')
    expect(rows[0]!.title).toBe('YouTube ▸ cute otters')
    expect(rows[0]!.enter).toEqual({
      kind: 'open-url',
      url: 'https://www.youtube.com/results?search_query=cute%20otters',
    })
  })

  it('bare trigger goes to the site root, titled with the hostname', () => {
    const rows = quicklinkRows(yt, '')
    expect(rows[0]!.title).toBe('YouTube ▸ www.youtube.com')
    expect(rows[0]!.enter).toEqual({
      kind: 'open-url',
      url: 'https://www.youtube.com/',
    })
  })

  it('bare trigger on a plain link (no placeholder) opens the link itself', () => {
    const hn: Link = {
      name: 'HN newest',
      trigger: 'hn',
      url: 'https://news.ycombinator.com/newest',
    }
    const rows = quicklinkRows(hn, '')
    expect(rows[0]!.enter).toEqual({
      kind: 'open-url',
      url: 'https://news.ycombinator.com/newest',
    })
  })
})

describe('searchEngineLabel', () => {
  it('names the engine from the hostname', () => {
    expect(searchEngineLabel(GOOGLE)).toBe('Google')
    expect(searchEngineLabel('https://duckduckgo.com/?q={query}')).toBe(
      'Duckduckgo',
    )
    expect(searchEngineLabel('not a url')).toBe('the web')
  })
})

describe('add-quicklink rows', () => {
  it('URL detection yields Open + Add quicklink rows', () => {
    const rows = launchRows('stripe.com', ITEMS, {}, GOOGLE)
    expect(rows[0]!.key).toBe('url')
    expect(rows[1]!.key).toBe('add-quicklink')
    expect(rows[1]!.enter).toEqual({
      kind: 'add-quicklink',
      url: 'https://stripe.com',
    })
  })

  it('draft name step reflects the typed name', () => {
    const d = { url: 'https://stripe.com', name: '', step: 'name' as const }
    expect(draftRows(d, '', ['Safari'])[0]!.title).toContain('type a name')
    expect(draftRows(d, 'Stripe', ['Safari'])[0]!.title).toContain('“Stripe”')
  })

  it('draft browser step lists default first, then installed browsers', () => {
    const d = {
      url: 'https://stripe.com',
      name: 'Stripe',
      step: 'browser' as const,
    }
    const rows = draftRows(d, '', ['Safari', 'Arc'])
    expect(rows.map((r) => r.title)).toEqual([
      'Default browser',
      'Safari',
      'Arc',
    ])
    expect(rows[0]!.enter).toEqual({ kind: 'pick-browser', browser: null })
    expect(rows[2]!.enter).toEqual({ kind: 'pick-browser', browser: 'Arc' })
  })
})
