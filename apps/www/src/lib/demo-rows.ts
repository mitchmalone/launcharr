import { parseInput } from '@launcharr/core/grammar'
import {
  type Row as CoreRow,
  emojiRows,
  launchRows,
  quicklinkRows,
} from '@launcharr/core/rows'
import type { FrecencyMap, IndexItem } from '@launcharr/core/types'

import { INDEX, QUICKLINKS, TRIGGERS } from './launch-index'

/**
 * Thin adapter between the real engine (@launcharr/core) and the demo panel. All grammar,
 * matching, ranking, and row logic runs in core; this file only translates core rows into
 * the demo's presentation shape — no engine logic lives on the website.
 */
export type DemoRow = {
  key: string
  glyph: string
  hint: string
  title: string
  positions: number[]
  /** Toast copy simulating what Enter would have done in the app. */
  action: string
  /** Set for index items so the demo can bump frecency on fire. */
  id?: string
}

/** Same shape the app ships as its default searchFallback. */
const SEARCH_FALLBACK = 'https://www.google.com/search?q={query}'

/** The mock index in the engine's shape; `path` is display-only fiction here. */
const CORE_INDEX: IndexItem[] = INDEX.map((item) => ({
  id: item.id,
  name: item.name,
  kind: item.kind,
  path: '',
  hint: item.hint,
  icon: item.icon ?? null,
  aliases: item.aliases,
}))

const KIND_BY_ID = new Map(INDEX.map((item) => [item.id, item.kind]))

const stripScheme = (url: string) => url.replace(/^https?:\/\//, '')

/** Human-readable toast line for what the app would do on Enter. */
function actionFor(row: CoreRow): string {
  const enter = row.enter
  switch (enter.kind) {
    case 'execute': {
      const verb = KIND_BY_ID.get(enter.id) === 'command' ? 'ran' : 'launched'
      return `${verb} ${row.title}`
    }
    case 'open-url':
      return `opened ${stripScheme(enter.url)}`
    case 'copy':
      return `copied ${enter.text}`
    case 'add-quicklink':
      return `drafted a quicklink for ${stripScheme(enter.url)}`
    default:
      return row.title
  }
}

function toDemoRow(row: CoreRow): DemoRow {
  return {
    key: row.key,
    // Index items carry their mock emoji icon; engine rows (url, math, …) use core glyphs.
    glyph: row.icon ?? row.glyph,
    hint: row.hint,
    title: row.title,
    positions: row.positions,
    action: actionFor(row),
    id: row.enter.kind === 'execute' ? row.enter.id : undefined,
  }
}

export function computeDemoRows(raw: string, frecency: FrecencyMap): DemoRow[] {
  const parsed = parseInput(raw, TRIGGERS)
  // The site demo has no terminal or claude CLI behind it.
  if (parsed.mode === 'bang' || parsed.mode === 'ask') return []
  if (parsed.mode === 'emoji') return emojiRows(parsed.query).map(toDemoRow)
  if (parsed.mode === 'trigger') {
    const link = QUICKLINKS.find((l) => l.trigger === parsed.trigger)
    if (!link) return []
    return quicklinkRows(link, parsed.args).map(toDemoRow)
  }
  return launchRows(parsed.query, CORE_INDEX, frecency, SEARCH_FALLBACK).map(
    toDemoRow,
  )
}
