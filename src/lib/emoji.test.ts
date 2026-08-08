import { describe, expect, it } from 'vitest';
import { searchEmoji } from './emoji';

describe('searchEmoji', () => {
  it('finds fire by name', () => {
    const results = searchEmoji('fire', 8);
    expect(results[0].entry.emoji).toBe('🔥');
    expect(results[0].positions.length).toBeGreaterThan(0);
  });

  it('finds shrug by keyword-ish queries', () => {
    const all = searchEmoji('shrug', 8).map((r) => r.entry.emoji);
    expect(all.some((e) => e.includes('🤷'))).toBe(true);
  });

  it('empty query returns a stable first page', () => {
    expect(searchEmoji('', 8)).toHaveLength(8);
    expect(searchEmoji('  ', 8)).toHaveLength(8);
  });

  it('nonsense yields nothing', () => {
    expect(searchEmoji('zzxqzzxq', 8)).toEqual([]);
  });

  it('respects the limit', () => {
    expect(searchEmoji('a', 3).length).toBeLessThanOrEqual(3);
  });
});
