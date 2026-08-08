import { evaluate, formatResult } from './math';
import { fuzzyMatch } from './matcher';
import { rank, MAX_RESULTS } from './ranking';
import type { Clip, FrecencyMap, IndexItem, ScriptItem } from './types';

/**
 * The one row model every mode renders through, so selection, keyboard handling, and
 * rendering stay single-path. `enter` describes what Enter should invoke — the App maps it
 * to the right IPC command.
 */
export type Row = {
  key: string;
  title: string;
  hint: string;
  positions: number[];
  icon: string | null;
  glyph: string;
  enter: RowEnter;
};

export type RowEnter =
  | { kind: 'execute'; id: string }
  | { kind: 'copy'; text: string }
  | { kind: 'script-action'; index: number }
  | { kind: 'copy-clip'; content: string }
  | { kind: 'clear-clips' };

function kindGlyph(item: IndexItem): string {
  if (item.kind === 'settings') return '⚙';
  if (item.kind === 'link') return '↗';
  return '⚓︎';
}

/** Launch mode: an inline-math row (when the query computes) above the ranked matches. */
export function launchRows(
  query: string,
  index: IndexItem[],
  frecency: FrecencyMap
): Row[] {
  const rows: Row[] = [];
  const math = evaluate(query);
  if (math !== null) {
    const text = formatResult(math);
    rows.push({
      key: 'math',
      title: `= ${text}`,
      hint: 'copy',
      positions: [],
      icon: null,
      glyph: '𝜮',
      enter: { kind: 'copy', text },
    });
  }
  for (const { item, positions } of rank(query, index, frecency)) {
    rows.push({
      key: item.id,
      title: item.name,
      hint: item.hint,
      positions,
      icon: item.icon,
      glyph: kindGlyph(item),
      enter: { kind: 'execute', id: item.id },
    });
  }
  return rows.slice(0, MAX_RESULTS);
}

export function scriptRows(items: ScriptItem[]): Row[] {
  return items.slice(0, MAX_RESULTS).map((item, i) => ({
    key: `script-${i}`,
    title: item.title,
    hint: item.subtitle || 'script',
    positions: [],
    icon: null,
    glyph: '❯',
    enter: { kind: 'script-action', index: i },
  }));
}

/** Clip mode: fuzzy-filter history by args; `clip clear` offers the wipe. */
export function clipRows(args: string, clips: Clip[]): Row[] {
  const query = args.trim();
  if (query === 'clear') {
    return [
      {
        key: 'clip-clear',
        title: 'Clear clipboard history',
        hint: `${clips.length} items`,
        positions: [],
        icon: null,
        glyph: '✕',
        enter: { kind: 'clear-clips' },
      },
    ];
  }
  const matched = query
    ? clips
        .map((clip) => ({
          clip,
          m: fuzzyMatch(query, clipTitle(clip.content)),
        }))
        .filter((x) => x.m !== null)
        .sort((a, b) => (b.m?.score ?? 0) - (a.m?.score ?? 0))
    : clips.map((clip) => ({ clip, m: null }));
  return matched.slice(0, MAX_RESULTS).map(({ clip, m }) => ({
    key: `clip-${clip.id}`,
    title: clipTitle(clip.content),
    hint: 'clip',
    positions: m?.positions ?? [],
    icon: null,
    glyph: '⧉',
    enter: { kind: 'copy-clip', content: clip.content },
  }));
}

/** One displayable line out of arbitrary clipboard text. */
export function clipTitle(content: string): string {
  const line = content.trim().split('\n')[0] ?? '';
  return line.length > 70 ? `${line.slice(0, 70)}…` : line;
}
