/**
 * The input grammar, v1.1: one dispatch table, two kinds of entry (PRD §4.4's grammar note,
 * now real). `!` is first-char dispatch; script/built-in trigger words are first-token
 * dispatch — `lorem 3`, `json`, `clip err`. Everything else is launch mode.
 */

export type ParsedInput =
  | { mode: 'launch'; query: string }
  | { mode: 'bang'; command: string }
  | { mode: 'emoji'; query: string }
  | { mode: 'trigger'; trigger: string; args: string };

type PrefixMode = 'bang' | 'emoji';

const PREFIX_MODES: Record<string, PrefixMode> = {
  '!': 'bang',
  ':': 'emoji',
};

export function parseInput(
  raw: string,
  triggers: ReadonlySet<string>
): ParsedInput {
  const mode = PREFIX_MODES[raw[0] ?? ''];
  if (mode === 'bang') {
    // Everything after the bang, verbatim — no trimming beyond the prefix itself.
    return { mode: 'bang', command: raw.slice(1) };
  }
  if (mode === 'emoji') {
    return { mode: 'emoji', query: raw.slice(1) };
  }

  // First-token trigger: the trigger word followed by end-of-input or a space. A trigger
  // only fires as a whole word, so `jso` still fuzzy-matches apps.
  const spaceIndex = raw.indexOf(' ');
  const firstToken = spaceIndex === -1 ? raw : raw.slice(0, spaceIndex);
  if (firstToken.length > 0 && triggers.has(firstToken)) {
    return {
      mode: 'trigger',
      trigger: firstToken,
      args: spaceIndex === -1 ? '' : raw.slice(spaceIndex + 1),
    };
  }

  return { mode: 'launch', query: raw };
}
