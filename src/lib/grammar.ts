/**
 * The input grammar. `!` is the first reserved prefix; v2 adds script-defined commands to the
 * same table, which is why this is a general first-char dispatch step and not a special case
 * (PRD §4.4).
 */

export type ParsedInput =
  { mode: 'launch'; query: string } | { mode: 'bang'; command: string };

type PrefixMode = 'bang';

const PREFIX_MODES: Record<string, PrefixMode> = {
  '!': 'bang',
};

export function parseInput(raw: string): ParsedInput {
  const mode = PREFIX_MODES[raw[0] ?? ''];
  if (mode === 'bang') {
    // Everything after the bang, verbatim — no trimming beyond the prefix itself.
    return { mode: 'bang', command: raw.slice(1) };
  }
  return { mode: 'launch', query: raw };
}
