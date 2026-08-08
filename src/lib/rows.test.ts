import { describe, expect, it } from 'vitest';
import { launchRows, quicklinkRows, searchEngineLabel } from './rows';
import type { IndexItem, Link } from './types';

const GOOGLE = 'https://www.google.com/search?q={query}';

function app(name: string): IndexItem {
  return {
    id: `/Applications/${name}.app`,
    name,
    kind: 'app',
    path: `/Applications/${name}.app`,
    hint: 'app',
    icon: null,
    aliases: [],
  };
}

const ITEMS = [app('Safari'), app('Slack')];

describe('launchRows', () => {
  it('URL-ish query gets an open row on top, above matches', () => {
    const rows = launchRows('safari.com', ITEMS, {}, GOOGLE);
    expect(rows[0].enter).toEqual({
      kind: 'open-url',
      url: 'https://safari.com',
    });
    // Safari still matches "safari.com"? No — dots break the subsequence; either way
    // the URL row must be first.
    expect(rows[0].key).toBe('url');
  });

  it('search fallback appears ONLY when nothing else matches (Alfred behaviour)', () => {
    const dead = launchRows('zzqx', ITEMS, {}, GOOGLE);
    expect(dead).toHaveLength(1);
    expect(dead[0].title).toBe('Search Google for “zzqx”');
    expect(dead[0].enter).toEqual({
      kind: 'open-url',
      url: 'https://www.google.com/search?q=zzqx',
    });

    const alive = launchRows('saf', ITEMS, {}, GOOGLE);
    expect(alive.some((r) => r.key === 'search-fallback')).toBe(false);
  });

  it('math row suppresses the search fallback', () => {
    const rows = launchRows('2+2', ITEMS, {}, GOOGLE);
    expect(rows[0].key).toBe('math');
    expect(rows.some((r) => r.key === 'search-fallback')).toBe(false);
  });

  it('empty query yields no rows at all', () => {
    expect(launchRows('', ITEMS, {}, GOOGLE)).toEqual([]);
    expect(launchRows('   ', ITEMS, {}, GOOGLE)).toEqual([]);
  });
});

describe('quicklinkRows', () => {
  const yt: Link = {
    name: 'YouTube',
    trigger: 'yt',
    url: 'https://www.youtube.com/results?search_query={query}',
  };

  it('substitutes the encoded args into the template', () => {
    const rows = quicklinkRows(yt, 'cute otters');
    expect(rows[0].title).toBe('YouTube ▸ cute otters');
    expect(rows[0].enter).toEqual({
      kind: 'open-url',
      url: 'https://www.youtube.com/results?search_query=cute%20otters',
    });
  });

  it('empty args prompt for a query but still open the base search', () => {
    const rows = quicklinkRows(yt, '');
    expect(rows[0].title).toBe('YouTube ▸ type a query…');
    expect(rows[0].enter).toEqual({
      kind: 'open-url',
      url: 'https://www.youtube.com/results?search_query=',
    });
  });
});

describe('searchEngineLabel', () => {
  it('names the engine from the hostname', () => {
    expect(searchEngineLabel(GOOGLE)).toBe('Google');
    expect(searchEngineLabel('https://duckduckgo.com/?q={query}')).toBe(
      'Duckduckgo'
    );
    expect(searchEngineLabel('not a url')).toBe('the web');
  });
});
