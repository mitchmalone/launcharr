import { describe, expect, it } from 'vitest';
import { detectUrl, fillQuery } from './url';

describe('detectUrl', () => {
  it('accepts explicit schemes as-is', () => {
    expect(detectUrl('https://github.com/foo')).toBe('https://github.com/foo');
    expect(detectUrl('http://example.com')).toBe('http://example.com');
  });

  it('adds https to bare domains with known TLDs', () => {
    expect(detectUrl('github.com')).toBe('https://github.com');
    expect(detectUrl('emberstash.com/jobs')).toBe(
      'https://emberstash.com/jobs'
    );
    expect(detectUrl('app.emberstash.com')).toBe('https://app.emberstash.com');
    expect(detectUrl('news.ycombinator.com?p=2')).toBe(
      'https://news.ycombinator.com?p=2'
    );
  });

  it('handles localhost with ports and paths', () => {
    expect(detectUrl('localhost:5273')).toBe('http://localhost:5273');
    expect(detectUrl('localhost:3000/api/health')).toBe(
      'http://localhost:3000/api/health'
    );
    expect(detectUrl('localhost')).toBe('http://localhost');
  });

  it('rejects queries with spaces', () => {
    expect(detectUrl('github com')).toBeNull();
    expect(detectUrl('what is github.com')).toBeNull();
  });

  it('rejects dots that are not URLs', () => {
    expect(detectUrl('node.js')).toBeNull(); // js is not a TLD
    expect(detectUrl('report.txt')).toBeNull();
    expect(detectUrl('v1.2')).toBeNull();
    expect(detectUrl('safari')).toBeNull();
    expect(detectUrl('')).toBeNull();
  });

  it('trims surrounding whitespace', () => {
    expect(detectUrl('  github.com  ')).toBe('https://github.com');
  });
});

describe('fillQuery', () => {
  it('encodes the query into the placeholder', () => {
    expect(
      fillQuery('https://www.google.com/search?q={query}', 'cute otters & co')
    ).toBe('https://www.google.com/search?q=cute%20otters%20%26%20co');
  });

  it('fills multiple placeholders', () => {
    expect(fillQuery('https://x.dev/{query}/compare/{query}', 'a b')).toBe(
      'https://x.dev/a%20b/compare/a%20b'
    );
  });
});
