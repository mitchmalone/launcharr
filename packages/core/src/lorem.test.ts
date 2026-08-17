import { describe, expect, it } from 'vitest'

import { LOREM_VOLUMES, generateLorem, loremToast, loremVolume } from './lorem'

/** mulberry32 — a tiny seeded PRNG so the tests pin exact output shapes. */
function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const words = (s: string) => s.split(/\s+/).filter(Boolean)
const sentences = (s: string) => s.split(/(?<=\.)\s+/).filter(Boolean)

describe('generateLorem', () => {
  it('title is a short capitalized phrase without a full stop', () => {
    for (let seed = 1; seed < 40; seed++) {
      const t = generateLorem('title', seeded(seed))
      const w = words(t)
      expect(w.length).toBeGreaterThanOrEqual(3)
      expect(w.length).toBeLessThanOrEqual(6)
      expect(t.endsWith('.')).toBe(false)
      for (const word of w) expect(word[0]).toMatch(/[A-Z]/)
    }
  })

  it('sentence counts match the volume', () => {
    for (let seed = 1; seed < 40; seed++) {
      expect(sentences(generateLorem('sentence', seeded(seed)))).toHaveLength(1)
      expect(sentences(generateLorem('sentences2', seeded(seed)))).toHaveLength(
        2,
      )
    }
  })

  it('a sentence starts capitalized, ends with one full stop, sits at 6–14 words', () => {
    for (let seed = 1; seed < 60; seed++) {
      const s = generateLorem('sentence', seeded(seed))
      expect(s).toMatch(/^[A-Z][a-z]/)
      expect(s).toMatch(/[a-z]\.$/)
      expect(s.match(/\./g)).toHaveLength(1)
      const n = words(s).length
      expect(n).toBeGreaterThanOrEqual(6)
      expect(n).toBeLessThanOrEqual(14)
    }
  })

  it('a paragraph opens classically, then wanders; two paragraphs are blank-line separated', () => {
    const p = generateLorem('paragraph', seeded(7))
    expect(
      p.startsWith('Lorem ipsum dolor sit amet, consectetur adipiscing elit.'),
    ).toBe(true)
    const n = words(p).length
    expect(n).toBeGreaterThanOrEqual(40)
    expect(n).toBeLessThanOrEqual(100)
    expect(p.includes('\n')).toBe(false)

    const pp = generateLorem('paragraphs2', seeded(7))
    const parts = pp.split('\n\n')
    expect(parts).toHaveLength(2)
    // Only the first paragraph carries the classic opening.
    expect(
      parts[1]!.startsWith('Lorem ipsum dolor sit amet, consectetur'),
    ).toBe(false)
  })

  it('is semi-random: different seeds, different text; same seed, same text', () => {
    const a = generateLorem('paragraph', seeded(1))
    const b = generateLorem('paragraph', seeded(2))
    const a2 = generateLorem('paragraph', seeded(1))
    expect(a).not.toBe(b)
    expect(a).toBe(a2)
  })

  it('never emits a double space or a comma at a sentence edge', () => {
    for (let seed = 1; seed < 60; seed++) {
      const p = generateLorem('paragraphs2', seeded(seed))
      expect(p).not.toMatch(/ {2}/)
      expect(p).not.toMatch(/,\./)
      expect(p).not.toMatch(/^,|\s,/m)
    }
  })

  it('draws every word from the lorem vocabulary (only rng-driven variety)', () => {
    const p = generateLorem('paragraphs2', seeded(3)).toLowerCase()
    for (const w of words(p)) expect(w).toMatch(/^[a-z]+[.,]?$/)
  })

  it('works with the default rng', () => {
    expect(words(generateLorem('sentence')).length).toBeGreaterThan(0)
  })
})

describe('volumes + toast copy', () => {
  it('lists the five volumes in ticket order', () => {
    expect(LOREM_VOLUMES.map((v) => v.id)).toEqual([
      'title',
      'sentence',
      'sentences2',
      'paragraph',
      'paragraphs2',
    ])
    expect(LOREM_VOLUMES.map((v) => v.label)).toEqual([
      'Title',
      '1 sentence',
      '2 sentences',
      'Paragraph',
      '2 paragraphs',
    ])
  })

  it('resolves ids and rejects junk', () => {
    expect(loremVolume('paragraph')?.id).toBe('paragraph')
    expect(loremVolume('nope')).toBeUndefined()
  })

  it('phrases the confirmation per volume', () => {
    expect(loremToast('title')).toBe('Copied a lorem ipsum title')
    expect(loremToast('sentence')).toBe('Copied 1 sentence of lorem ipsum')
    expect(loremToast('paragraphs2')).toBe('Copied 2 paragraphs of lorem ipsum')
  })
})
