/**
 * Built-in `lorem` trigger: semi-random placeholder text at five volumes. Pure and
 * rng-injectable so the shape is testable; the app calls it with Math.random at Enter time,
 * so every copy is fresh (a fixed block was the old bundled script's whole personality —
 * retired 2026-08-17 for this).
 */

export type LoremVolume =
  'title' | 'sentence' | 'sentences2' | 'paragraph' | 'paragraphs2'

export interface LoremVolumeInfo {
  id: LoremVolume
  /** Row title, ticket wording. */
  label: string
  /** Row hint: roughly what you get. */
  hint: string
}

export const LOREM_VOLUMES: readonly LoremVolumeInfo[] = [
  { id: 'title', label: 'Title', hint: '3–6 words, Title Case' },
  { id: 'sentence', label: '1 sentence', hint: '6–14 words' },
  { id: 'sentences2', label: '2 sentences', hint: '~20 words' },
  { id: 'paragraph', label: 'Paragraph', hint: '5–7 sentences, ~60 words' },
  { id: 'paragraphs2', label: '2 paragraphs', hint: '~120 words' },
]

export function loremVolume(id: string): LoremVolumeInfo | undefined {
  return LOREM_VOLUMES.find((v) => v.id === id)
}

/** The confirmation toast after a copy. */
export function loremToast(volume: LoremVolume): string {
  switch (volume) {
    case 'title':
      return 'Copied a lorem ipsum title'
    case 'sentence':
      return 'Copied 1 sentence of lorem ipsum'
    case 'sentences2':
      return 'Copied 2 sentences of lorem ipsum'
    case 'paragraph':
      return 'Copied a paragraph of lorem ipsum'
    case 'paragraphs2':
      return 'Copied 2 paragraphs of lorem ipsum'
  }
}

/** The classic opening — the first sentence of a paragraph keeps it so the text
 * still reads as "lorem ipsum" at a glance; everything after wanders. */
const OPENING = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.'

const WORDS = [
  'lorem',
  'ipsum',
  'dolor',
  'sit',
  'amet',
  'consectetur',
  'adipiscing',
  'elit',
  'sed',
  'do',
  'eiusmod',
  'tempor',
  'incididunt',
  'ut',
  'labore',
  'et',
  'dolore',
  'magna',
  'aliqua',
  'enim',
  'ad',
  'minim',
  'veniam',
  'quis',
  'nostrud',
  'exercitation',
  'ullamco',
  'laboris',
  'nisi',
  'aliquip',
  'ex',
  'ea',
  'commodo',
  'consequat',
  'duis',
  'aute',
  'irure',
  'in',
  'reprehenderit',
  'voluptate',
  'velit',
  'esse',
  'cillum',
  'eu',
  'fugiat',
  'nulla',
  'pariatur',
  'excepteur',
  'sint',
  'occaecat',
  'cupidatat',
  'non',
  'proident',
  'sunt',
  'culpa',
  'qui',
  'officia',
  'deserunt',
  'mollit',
  'anim',
  'id',
  'est',
  'laborum',
  'vitae',
  'sapien',
  'pellentesque',
  'habitant',
  'morbi',
  'tristique',
  'senectus',
  'netus',
  'malesuada',
  'fames',
  'turpis',
  'egestas',
  'integer',
  'feugiat',
  'scelerisque',
  'varius',
  'nunc',
  'faucibus',
  'ornare',
  'suspendisse',
  'ultrices',
  'gravida',
  'dictum',
  'fusce',
  'placerat',
  'orci',
  'phasellus',
  'vestibulum',
  'lectus',
  'mauris',
  'ultricies',
  'tortor',
  'condimentum',
  'lacinia',
  'quam',
  'porta',
  'nibh',
  'venenatis',
  'cras',
  'sagittis',
]

type Rng = () => number

const pick = <T>(list: readonly T[], rng: Rng): T =>
  list[Math.floor(rng() * list.length)]!
const between = (lo: number, hi: number, rng: Rng) =>
  lo + Math.floor(rng() * (hi - lo + 1))
const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1)

/** n distinct-ish words: no immediate repeats, so "sed sed" never happens. */
function run(n: number, rng: Rng): string[] {
  const out: string[] = []
  while (out.length < n) {
    const w = pick(WORDS, rng)
    if (w !== out[out.length - 1]) out.push(w)
  }
  return out
}

function sentence(rng: Rng, minWords = 6): string {
  const ws = run(between(minWords, 14, rng), rng)
  // One comma in longer sentences, never at either edge.
  if (ws.length >= 9 && rng() < 0.7) {
    const at = between(3, ws.length - 3, rng)
    ws[at] = `${ws[at]},`
  }
  ws[0] = cap(ws[0]!)
  return `${ws.join(' ')}.`
}

/** 5–7 sentences of 8–14 words: lands in the ticket's ~40–60-word band, sometimes over. */
function paragraph(rng: Rng, classic: boolean): string {
  const count = between(5, 7, rng)
  const out = classic ? [OPENING] : []
  while (out.length < count) out.push(sentence(rng, 8))
  return out.join(' ')
}

/**
 * Generate text at `volume`. `rng` returns [0, 1) — Math.random by default; pass a
 * seeded one for reproducible output.
 */
export function generateLorem(
  volume: LoremVolume,
  rng: Rng = Math.random,
): string {
  switch (volume) {
    case 'title':
      return run(between(3, 6, rng), rng)
        .map(cap)
        .join(' ')
    case 'sentence':
      return sentence(rng)
    case 'sentences2':
      return `${sentence(rng)} ${sentence(rng)}`
    case 'paragraph':
      return paragraph(rng, true)
    case 'paragraphs2':
      return `${paragraph(rng, true)}\n\n${paragraph(rng, false)}`
  }
}
