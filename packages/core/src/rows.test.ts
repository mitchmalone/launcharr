import { describe, expect, it } from 'vitest'

import {
  awakeRows,
  draftRows,
  launchRows,
  loremEntryRow,
  loremRows,
  panelRows,
  quicklinkRows,
  searchEngineLabel,
} from './rows'
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

  it('panel items fuzzy-match like apps and Enter opens the panel', () => {
    const usage: IndexItem = {
      id: 'panel:usage',
      name: 'Usage',
      kind: 'panel',
      path: 'usage',
      hint: 'token monitor ▸',
      icon: null,
      aliases: ['usage'],
    }
    const rows = launchRows('usag', [...ITEMS, usage], {}, GOOGLE)
    expect(rows[0]!.title).toBe('Usage')
    expect(rows[0]!.glyph).toBe('▤')
    expect(rows[0]!.enter).toEqual({ kind: 'open-panel', panel: 'usage' })
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

describe('panelRows', () => {
  it('one row that opens the named panel on Enter', () => {
    const rows = panelRows('wifi', 'Wi-Fi', 'networks & status ▸')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.title).toBe('Wi-Fi')
    expect(rows[0]!.enter).toEqual({ kind: 'open-panel', panel: 'wifi' })
  })
})

describe('builtin items', () => {
  it('a builtin index item ranks like an app and enters as its trigger', () => {
    const lorem: IndexItem = {
      id: 'builtin:lorem',
      name: 'Lorem ipsum',
      kind: 'builtin',
      path: 'lorem',
      hint: 'placeholder text ▸',
      icon: null,
      aliases: ['lorem'],
    }
    const rows = launchRows('lor', [lorem], {}, 'https://x/{query}')
    expect(rows[0]!.title).toBe('Lorem ipsum')
    expect(rows[0]!.enter).toEqual({ kind: 'builtin', trigger: 'lorem' })
  })
})

describe('loremEntryRow', () => {
  it('one row whose Enter opens the volume menu', () => {
    const rows = loremEntryRow()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.enter).toEqual({ kind: 'lorem-menu' })
  })
})

describe('loremRows', () => {
  it('five volumes in ticket order, each a lorem Enter', () => {
    const rows = loremRows()
    expect(rows.map((r) => r.title)).toEqual([
      'Title',
      '1 sentence',
      '2 sentences',
      'Paragraph',
      '2 paragraphs',
    ])
    expect(rows[4]!.enter).toEqual({ kind: 'lorem', volume: 'paragraphs2' })
    for (const r of rows) expect(r.hint).toMatch(/copy$/)
  })
})

describe('awakeRows', () => {
  it('a duration arms with the end condition in the title', () => {
    const rows = awakeRows('2h')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.title).toBe('Mac stays awake for 2h')
    expect(rows[0]!.enter).toEqual({
      kind: 'awake-arm',
      until: { kind: 'timer', minutes: 120 },
    })
  })

  it('off releases', () => {
    expect(awakeRows('off')[0]!.enter).toEqual({ kind: 'awake-release' })
  })

  it('unparseable args fall back to opening the panel', () => {
    expect(awakeRows('sideways')[0]!.enter).toEqual({
      kind: 'open-panel',
      panel: 'awake',
    })
  })
})
