import { type AwakeUntil, parseAwakeArgs, untilLabel } from './awake'
import { searchEmoji } from './emoji'
import { LOREM_VOLUMES, type LoremVolume } from './lorem'
import { fuzzyMatch } from './matcher'
import { evaluate, formatResult } from './math'
import { MAX_RESULTS, rank } from './ranking'
import type { Clip, FrecencyMap, IndexItem, Link, ScriptItem } from './types'
import { detectUrl, fillQuery, quicklinkTarget } from './url'

/**
 * The one row model every mode renders through, so selection, keyboard handling, and
 * rendering stay single-path. `enter` describes what Enter should invoke — the App maps it
 * to the right IPC command.
 */
export type Row = {
  key: string
  title: string
  hint: string
  positions: number[]
  icon: string | null
  glyph: string
  enter: RowEnter
  /** Secondary action on ⌥⏎; the hint column shows `label` while ⌥ is held. */
  alt?: { label: string; enter: RowEnter }
}

export type RowEnter =
  | { kind: 'execute'; id: string }
  | { kind: 'copy'; text: string }
  | { kind: 'open-url'; url: string }
  | { kind: 'script-action'; index: number }
  | { kind: 'copy-clip'; content: string }
  | { kind: 'clear-clips' }
  | { kind: 'add-quicklink'; url: string }
  | { kind: 'draft-commit-name' }
  | { kind: 'pick-browser'; browser: string | null }
  | { kind: 'reveal'; path: string }
  | { kind: 'delete-clip'; id: number }
  | { kind: 'script-alt-action'; index: number }
  | { kind: 'open-panel'; panel: string }
  | { kind: 'awake-arm'; until: AwakeUntil }
  | { kind: 'awake-release' }
  /** Built-in `lorem`, step one: Enter on the keyword opens the volume menu. */
  | { kind: 'lorem-menu' }
  /** Step two: generate at Enter time (fresh every copy) and confirm with a toast. */
  | { kind: 'lorem'; volume: LoremVolume }

/** ⌥⏎ per item kind: apps reveal in Finder, links copy their URL. */
function itemAlt(item: IndexItem): Row['alt'] {
  if (item.kind === 'app') {
    return {
      label: 'reveal in finder',
      enter: { kind: 'reveal', path: item.path },
    }
  }
  if (item.kind === 'link') {
    return { label: 'copy url', enter: { kind: 'copy', text: item.path } }
  }
  return undefined
}

function kindGlyph(item: IndexItem): string {
  if (item.kind === 'settings') return '⚙'
  if (item.kind === 'link') return '↗'
  if (item.kind === 'command') return '⏻'
  if (item.kind === 'panel') return '▤'
  return '⚓︎'
}

/** "https://www.google.com/search?q={query}" → "Google", best-effort. */
export function searchEngineLabel(template: string): string {
  try {
    const host = new URL(template.replace('{query}', 'x')).hostname
    const label = host.replace(/^www\./, '').split('.')[0]!
    return label.charAt(0).toUpperCase() + label.slice(1)
  } catch {
    return 'the web'
  }
}

/**
 * Launch mode, top to bottom: URL row (when the query is URL-ish), inline-math row (when it
 * computes), ranked matches, and — only when none of the above produced anything — the
 * Alfred-style search fallback.
 */
export function launchRows(
  query: string,
  index: IndexItem[],
  frecency: FrecencyMap,
  searchFallback: string,
): Row[] {
  const rows: Row[] = []

  const url = detectUrl(query)
  if (url !== null) {
    rows.push({
      key: 'url',
      title: `Open ${url.replace(/^https?:\/\//, '')}`,
      hint: 'open',
      positions: [],
      icon: null,
      glyph: '↗',
      enter: { kind: 'open-url', url },
      alt: { label: 'copy url', enter: { kind: 'copy', text: url } },
    })
    rows.push({
      key: 'add-quicklink',
      title: 'Add quicklink…',
      hint: 'name · browser · favicon',
      positions: [],
      icon: null,
      glyph: '+',
      enter: { kind: 'add-quicklink', url },
    })
  }

  const math = evaluate(query)
  if (math !== null) {
    const text = formatResult(math)
    rows.push({
      key: 'math',
      title: `= ${text}`,
      hint: 'copy',
      positions: [],
      icon: null,
      glyph: '𝜮',
      enter: { kind: 'copy', text },
    })
  }

  for (const { item, positions } of rank(query, index, frecency)) {
    rows.push({
      key: item.id,
      title: item.name,
      hint: item.hint,
      positions,
      icon: item.icon,
      glyph: kindGlyph(item),
      enter:
        item.kind === 'panel'
          ? { kind: 'open-panel', panel: item.path }
          : { kind: 'execute', id: item.id },
      alt: itemAlt(item),
    })
  }

  if (rows.length === 0 && query.trim().length > 0) {
    rows.push({
      key: 'search-fallback',
      title: `Search ${searchEngineLabel(searchFallback)} for “${query.trim()}”`,
      hint: 'search',
      positions: [],
      icon: null,
      glyph: '⌕',
      enter: { kind: 'open-url', url: fillQuery(searchFallback, query.trim()) },
    })
  }

  return rows.slice(0, MAX_RESULTS)
}

/** The add-quicklink mini-form (Raycast-style): a name step, then a browser step. */
export type QuicklinkDraft = {
  url: string
  name: string
  step: 'name' | 'browser'
}

export function draftRows(
  draft: QuicklinkDraft,
  typedName: string,
  browsers: string[],
): Row[] {
  const shortUrl = draft.url.replace(/^https?:\/\//, '')
  if (draft.step === 'name') {
    return [
      {
        key: 'draft-name',
        title: typedName.trim()
          ? `Name “${typedName.trim()}” → ${shortUrl}`
          : `Quicklink for ${shortUrl} — type a name`,
        hint: '⏎ next',
        positions: [],
        icon: null,
        glyph: '+',
        enter: { kind: 'draft-commit-name' },
      },
    ]
  }
  return [
    {
      key: 'browser-default',
      title: 'Default browser',
      hint: '⏎ save',
      positions: [],
      icon: null,
      glyph: '↗',
      enter: { kind: 'pick-browser', browser: null },
    },
    ...browsers.map((b) => ({
      key: `browser-${b}`,
      title: b,
      hint: '⏎ save',
      positions: [],
      icon: null,
      glyph: '↗',
      enter: { kind: 'pick-browser', browser: b } as RowEnter,
    })),
  ]
}

/** Raycast-style quicklink in trigger mode: `yt cute otters ⏎`; bare trigger opens the site. */
export function quicklinkRows(link: Link, args: string): Row[] {
  const query = args.trim()
  const url = quicklinkTarget(link.url, query)
  const subtitle = query || hostOf(url)
  return [
    {
      key: `quicklink-${link.trigger ?? link.name}`,
      title: `${link.name} ▸ ${subtitle}`,
      hint: 'quicklink',
      positions: [],
      icon: null,
      glyph: '↗',
      enter: { kind: 'open-url', url },
      alt: {
        label: 'copy url',
        enter: { kind: 'copy', text: url },
      },
    },
  ]
}

/** Bare hostname of a URL for display, the URL itself if unparseable. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
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
    alt: item.altAction
      ? { label: 'alt action', enter: { kind: 'script-alt-action', index: i } }
      : undefined,
  }))
}

/** Emoji mode (`:fire`): fuzzy over names/keywords, Enter copies the emoji. */
export function emojiRows(query: string): Row[] {
  return searchEmoji(query, MAX_RESULTS).map(({ entry, positions }) => ({
    key: `emoji-${entry.emoji}`,
    title: entry.name,
    hint: 'copy',
    positions,
    icon: null,
    glyph: entry.emoji,
    enter: { kind: 'copy', text: entry.emoji },
  }))
}

/** Clip mode: fuzzy-filter history by args; `clip clear` offers the wipe. */
export function clipRows(args: string, clips: Clip[]): Row[] {
  const query = args.trim()
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
    ]
  }
  const matched = query
    ? clips
        .map((clip) => ({
          clip,
          m: fuzzyMatch(query, clipTitle(clip.content)),
        }))
        .filter((x) => x.m !== null)
        .sort((a, b) => (b.m?.score ?? 0) - (a.m?.score ?? 0))
    : clips.map((clip) => ({ clip, m: null }))
  return matched.slice(0, MAX_RESULTS).map(({ clip, m }) => ({
    key: `clip-${clip.id}`,
    title: clipTitle(clip.content),
    hint: 'clip',
    positions: m?.positions ?? [],
    icon: null,
    glyph: '⧉',
    enter: { kind: 'copy-clip', content: clip.content },
    alt: { label: 'delete', enter: { kind: 'delete-clip', id: clip.id } },
  }))
}

/** `lorem` typed: one row; Enter opens the volume menu (Mitch, 2026-08-17: the
 * keyword confirms first, then you choose). */
export function loremEntryRow(): Row[] {
  return [
    {
      key: 'lorem',
      title: 'Lorem ipsum',
      hint: 'placeholder text ▸',
      positions: [],
      icon: null,
      glyph: '¶',
      enter: { kind: 'lorem-menu' },
    },
  ]
}

/** The volume menu: five rows in the ticket's order. */
export function loremRows(): Row[] {
  return LOREM_VOLUMES.map((v) => ({
    key: `lorem-${v.id}`,
    title: v.label,
    hint: `${v.hint} · copy`,
    positions: [],
    icon: null,
    glyph: '¶',
    enter: { kind: 'lorem', volume: v.id },
  }))
}

/** One displayable line out of arbitrary clipboard text. */
export function clipTitle(content: string): string {
  const line = content.trim().split('\n')[0] ?? ''
  return line.length > 70 ? `${line.slice(0, 70)}…` : line
}

/**
 * `awake <args>` arms without the panel — the panel is for choosing, the
 * grammar for repeating. One row saying exactly what ⏎ starts and how it
 * ends; unparseable args fall back to the open-panel row.
 */
export function awakeRows(args: string): Row[] {
  const cmd = parseAwakeArgs(args)
  if (cmd?.kind === 'off') {
    return [
      {
        key: 'awake-off',
        title: 'Stop keeping this Mac awake',
        hint: 'sleeps normally again',
        positions: [],
        icon: null,
        glyph: '☾',
        enter: { kind: 'awake-release' },
      },
    ]
  }
  if (cmd?.kind === 'arm') {
    return [
      {
        key: 'awake-arm',
        title: `Mac stays awake ${untilLabel(cmd.until)}`,
        hint: 'screen can sleep · ⏎',
        positions: [],
        icon: null,
        glyph: '☉',
        enter: { kind: 'awake-arm', until: cmd.until },
      },
    ]
  }
  return panelRows('awake', 'Awake', 'keep-alive sessions ▸')
}

/** Trigger words that open a full TUI panel (`wifi ⏎`): one row, Enter opens. */
export function panelRows(panel: string, title: string, hint: string): Row[] {
  return [
    {
      key: `panel-${panel}`,
      title,
      hint,
      positions: [],
      icon: null,
      glyph: '▤',
      enter: { kind: 'open-panel', panel },
    },
  ]
}
