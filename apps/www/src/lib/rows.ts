import { parseInput } from './grammar'
import { INDEX, QUICKLINKS, kindGlyph } from './launch-index'
import { fuzzyMatch } from './matcher'
import { frecencyMultiplier } from './ranking'

const MAX_RESULTS = 8

export type Row = {
  key: string
  glyph: string
  hint: string
  title: string
  positions: number[]
  action: string
  id?: string
}

export function computeRows(
  raw: string,
  frecency: Record<string, number>,
): Row[] {
  const p = parseInput(raw)
  if (p.mode === 'bang') return []

  if (p.mode === 'trigger') {
    const link = QUICKLINKS.find((l) => l.trigger === p.trigger)
    if (!link) return []
    return [
      {
        key: 'ql',
        glyph: '↗',
        hint: 'quicklink',
        title: link.name + ' ▸ ' + (p.args.trim() || 'type a query…'),
        positions: [],
        action:
          'opened ' +
          link.url.replace('{query}', encodeURIComponent(p.args.trim() || '')),
      },
    ]
  }

  if (p.mode === 'emoji') {
    return [
      {
        key: 'emoji',
        glyph: '🙂',
        hint: 'emoji mode ships in the app',
        title: 'emoji picker',
        positions: [],
        action: '',
      },
    ]
  }

  const q = p.query
  if (q.length === 0) return []

  const scored: {
    item: (typeof INDEX)[number]
    score: number
    positions: number[]
  }[] = []
  for (const item of INDEX) {
    const nm = fuzzyMatch(q, item.name)
    let best = nm ? { score: nm.score, positions: nm.positions } : null
    for (const alias of item.aliases) {
      const am = fuzzyMatch(q, alias)
      if (am && (!best || am.score * 0.9 > best.score)) {
        best = { score: am.score * 0.9, positions: [] }
      }
    }
    if (!best) continue
    scored.push({
      item,
      score: best.score * frecencyMultiplier(frecency[item.id]),
      positions: best.positions,
    })
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    const fa = frecency[a.item.id] ?? 0
    const fb = frecency[b.item.id] ?? 0
    if (fb !== fa) return fb - fa
    if (a.item.name.length !== b.item.name.length)
      return a.item.name.length - b.item.name.length
    return a.item.name.localeCompare(b.item.name)
  })

  const rows: Row[] = scored
    .slice(0, MAX_RESULTS)
    .map(({ item, positions }) => ({
      key: item.id,
      glyph: kindGlyph(item),
      hint: item.hint,
      title: item.name,
      positions,
      action: (item.kind === 'command' ? 'ran ' : 'launched ') + item.name,
      id: item.id,
    }))

  if (rows.length === 0 && q.trim()) {
    rows.push({
      key: 'fallback',
      glyph: '⌕',
      hint: 'search',
      title: 'Search Google for “' + q.trim() + '”',
      positions: [],
      action: 'opened google.com/search?q=' + encodeURIComponent(q.trim()),
    })
  }
  return rows
}
