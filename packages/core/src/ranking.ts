import { fuzzyMatch } from './matcher'
import type { FrecencyMap, IndexItem } from './types'

export type ScoredItem = {
  item: IndexItem
  score: number
  /** Match positions in the display name; empty when the match was via an alias. */
  positions: number[]
}

/** Matches through an alias count, but slightly less than matching the visible name. */
const ALIAS_FACTOR = 0.9

export const MAX_RESULTS = 8

/**
 * Frecency multiplier (PRD §5.3): final = fuzzy × multiplier. Bounded to [1, 1.5) so a weak
 * textual match can never outrank an obviously better one — frecency settles ties and
 * near-ties, it doesn't override the query.
 */
export function frecencyMultiplier(frecency: number | undefined): number {
  if (!frecency || frecency <= 0) return 1
  return 1 + (0.5 * frecency) / (frecency + 5)
}

export function rank(
  query: string,
  items: IndexItem[],
  frecency: FrecencyMap,
): ScoredItem[] {
  // Empty query shows nothing rather than a guess (PRD §5.3 cold start).
  if (query.length === 0) return []

  const scored: ScoredItem[] = []
  for (const item of items) {
    const nameMatch = fuzzyMatch(query, item.name)
    let best = nameMatch
      ? { score: nameMatch.score, positions: nameMatch.positions }
      : null
    for (const alias of item.aliases) {
      const aliasMatch = fuzzyMatch(query, alias)
      if (
        aliasMatch &&
        (!best || aliasMatch.score * ALIAS_FACTOR > best.score)
      ) {
        best = { score: aliasMatch.score * ALIAS_FACTOR, positions: [] }
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
    if (a.item.name.length !== b.item.name.length) {
      return a.item.name.length - b.item.name.length
    }
    return a.item.name.localeCompare(b.item.name)
  })

  return scored.slice(0, MAX_RESULTS)
}
