import emojilib from 'emojilib'

import { fuzzyMatch } from './matcher'

/**
 * Emoji picker (`:` prefix — Slack muscle memory): fuzzy over emojilib's keywords, first
 * keyword doubling as the display name. Copy on Enter, like everything else that produces
 * text.
 */

export type EmojiEntry = {
  emoji: string
  name: string
  keywords: string
}

const ENTRIES: EmojiEntry[] = Object.entries(
  emojilib as Record<string, string[]>,
).map(([emoji, keywords]) => ({
  emoji,
  name: (keywords[0] ?? '').replaceAll('_', ' '),
  keywords: keywords.slice(0, 6).join(' ').replaceAll('_', ' '),
}))

export type EmojiMatch = { entry: EmojiEntry; positions: number[] }

/** Fuzzy-match emoji by name/keywords. Empty query → a stable, useful first page. */
export function searchEmoji(query: string, limit: number): EmojiMatch[] {
  const q = query.trim()
  if (q.length === 0) {
    return ENTRIES.slice(0, limit).map((entry) => ({ entry, positions: [] }))
  }
  const scored: { entry: EmojiEntry; score: number; positions: number[] }[] = []
  for (const entry of ENTRIES) {
    const nameMatch = fuzzyMatch(q, entry.name)
    if (nameMatch) {
      // Exact name beats prefix-of-longer ("fire" over "firefighter").
      const exact = entry.name === q.toLowerCase() ? 100 : 0
      scored.push({
        entry,
        score: nameMatch.score + 10 + exact,
        positions: nameMatch.positions,
      })
      continue
    }
    const kwMatch = fuzzyMatch(q, entry.keywords)
    if (kwMatch) {
      scored.push({ entry, score: kwMatch.score, positions: [] })
    }
  }
  scored.sort(
    (a, b) => b.score - a.score || a.entry.name.length - b.entry.name.length,
  )
  return scored
    .slice(0, limit)
    .map(({ entry, positions }) => ({ entry, positions }))
}
