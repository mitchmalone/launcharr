import { describe, expect, it } from 'vitest';
import { evaluate, formatResult } from './math';

describe('evaluate', () => {
  it('handles the four operations and precedence', () => {
    expect(evaluate('2+3*4')).toBe(14);
    expect(evaluate('(2+3)*4')).toBe(20);
    expect(evaluate('10-4/2')).toBe(8);
    expect(evaluate('7%3')).toBe(1);
  });

  it('handles decimals, spaces, and thousands separators', () => {
    expect(evaluate('2 * (14.5 + 3)')).toBe(35);
    expect(evaluate('1,000 + 24')).toBe(1024);
    expect(evaluate('1_000 * 2')).toBe(2000);
  });

  it('exponent is right-associative', () => {
    expect(evaluate('2^3^2')).toBe(512);
  });

  it('handles unary minus', () => {
    expect(evaluate('-4+10')).toBe(6);
    expect(evaluate('2*-3')).toBe(-6);
  });

  it('rejects non-math queries (app names stay app queries)', () => {
    expect(evaluate('1password')).toBeNull();
    expect(evaluate('safari')).toBeNull();
    expect(evaluate('日本語')).toBeNull();
  });

  it('rejects plain numbers — no operator, no math row', () => {
    expect(evaluate('42')).toBeNull();
    expect(evaluate('3.14')).toBeNull();
  });

  it('rejects malformed expressions', () => {
    expect(evaluate('2+')).toBeNull();
    expect(evaluate('(2+3')).toBeNull();
    expect(evaluate('2+3)')).toBeNull();
    expect(evaluate('*2')).toBeNull();
    expect(evaluate('')).toBeNull();
  });

  it('rejects division blow-ups rather than showing Infinity', () => {
    expect(evaluate('1/0')).toBeNull();
  });
});

describe('formatResult', () => {
  it('kills float noise', () => {
    expect(formatResult(0.1 + 0.2)).toBe('0.3');
  });

  it('keeps meaningful precision', () => {
    expect(formatResult(10 / 3)).toBe('3.3333333333');
    expect(formatResult(1024)).toBe('1024');
  });
});
