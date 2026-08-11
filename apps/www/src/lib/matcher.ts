const SCORE_MATCH = 16
const PENALTY_GAP_START = -4
const PENALTY_GAP_EXTEND = -2
const BONUS_BOUNDARY = 8
const BONUS_CAMEL = 7
const BONUS_CONSECUTIVE = 12
const BONUS_FIRST_CHAR = 8
const MAX_LEADING_PENALTY = -6

export type FuzzyMatch = {
  score: number
  positions: number[]
}

const isSep = (c: string) =>
  c === ' ' || c === '-' || c === '_' || c === '.' || c === '/' || c === ':'
const isUpper = (c: string) => c >= 'A' && c <= 'Z'
const isLower = (c: string) => c >= 'a' && c <= 'z'

function charBonus(target: string, j: number): number {
  if (j === 0) return BONUS_BOUNDARY
  const prev = target[j - 1]!
  if (isSep(prev)) return BONUS_BOUNDARY
  if (isLower(prev) && isUpper(target[j]!)) return BONUS_CAMEL
  return 0
}

const gapPenalty = (k: number, j: number) =>
  k === j - 1 ? 0 : PENALTY_GAP_START + (j - k - 2) * PENALTY_GAP_EXTEND

const leadingPenalty = (j: number) =>
  j === 0
    ? 0
    : Math.max(
        PENALTY_GAP_START + (j - 1) * PENALTY_GAP_EXTEND,
        MAX_LEADING_PENALTY,
      )

export function fuzzyMatch(query: string, target: string): FuzzyMatch | null {
  if (query.length === 0) return { score: 0, positions: [] }
  if (query.length > target.length) return null

  const q = query.toLowerCase()
  const t = target.toLowerCase()
  const n = q.length
  const m = t.length

  const score = Array.from({ length: n }, () =>
    new Array<number>(m).fill(-Infinity),
  )
  const from = Array.from({ length: n }, () => new Array<number>(m).fill(-1))

  for (let j = 0; j < m; j++) {
    if (q[0] !== t[j]) continue
    score[0]![j] =
      SCORE_MATCH +
      charBonus(target, j) +
      (j === 0 ? BONUS_FIRST_CHAR : 0) +
      leadingPenalty(j)
  }

  for (let i = 1; i < n; i++) {
    for (let j = i; j < m; j++) {
      if (q[i] !== t[j]) continue
      for (let k = i - 1; k < j; k++) {
        if (score[i - 1]![k] === -Infinity) continue
        const bonus =
          k === j - 1
            ? Math.max(BONUS_CONSECUTIVE, charBonus(target, j))
            : charBonus(target, j)
        const cand = score[i - 1]![k]! + gapPenalty(k, j) + SCORE_MATCH + bonus
        if (cand > score[i]![j]!) {
          score[i]![j] = cand
          from[i]![j] = k
        }
      }
    }
  }

  let best = -Infinity
  let bestJ = -1
  for (let j = 0; j < m; j++) {
    if (score[n - 1]![j]! > best) {
      best = score[n - 1]![j]!
      bestJ = j
    }
  }
  if (bestJ === -1) return null

  const positions = new Array<number>(n)
  let j = bestJ
  for (let i = n - 1; i >= 0; i--) {
    positions[i] = j
    j = from[i]![j]!
  }
  return { score: best, positions }
}
