import { describe, expect, it } from 'vitest';
import { parseInput } from './grammar';

describe('parseInput', () => {
  it('defaults to launch mode', () => {
    expect(parseInput('safari')).toEqual({ mode: 'launch', query: 'safari' });
    expect(parseInput('')).toEqual({ mode: 'launch', query: '' });
  });

  it('dispatches bang mode on a leading !', () => {
    expect(parseInput('!git status')).toEqual({
      mode: 'bang',
      command: 'git status',
    });
  });

  it('bang alone is an empty command (opens a terminal window)', () => {
    expect(parseInput('!')).toEqual({ mode: 'bang', command: '' });
  });

  it('passes the command through verbatim — no trimming, no quoting games', () => {
    expect(parseInput('! echo "hi"  ')).toEqual({
      mode: 'bang',
      command: ' echo "hi"  ',
    });
  });

  it('only the first character dispatches', () => {
    expect(parseInput('mail!')).toEqual({ mode: 'launch', query: 'mail!' });
  });

  it('a bang later in a bang command is part of the command', () => {
    expect(parseInput('!!last')).toEqual({ mode: 'bang', command: '!last' });
  });
});
