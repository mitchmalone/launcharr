/**
 * Subsequence fuzzy matching, fzf-family scoring (PRD §5.2): bonuses for word/camel-hump
 * boundaries, prefix matches, and consecutive runs; penalties for gaps. Pure function, no
 * I/O — the most unit-tested code in the repo, deliberately.
 */

export type MatchResult = {
  score: number;
  /** Indices into the target string, for highlighting. */
  positions: number[];
};

const SCORE_MATCH = 16;
const PENALTY_GAP_START = -4;
const PENALTY_GAP_EXTEND = -2;
const BONUS_BOUNDARY = 8;
const BONUS_CAMEL = 7;
const BONUS_CONSECUTIVE = 12;
const BONUS_FIRST_CHAR = 8;
/** Leading gap is penalised gently so prefix matches win without banning mid-word matches. */
const MAX_LEADING_PENALTY = -6;

function isWordSeparator(ch: string): boolean {
  return (
    ch === ' ' ||
    ch === '-' ||
    ch === '_' ||
    ch === '.' ||
    ch === '/' ||
    ch === ':'
  );
}

function isUpper(ch: string): boolean {
  return ch >= 'A' && ch <= 'Z';
}

function isLower(ch: string): boolean {
  return ch >= 'a' && ch <= 'z';
}

/** Positional bonus for matching target[j], from the character before it. */
function charBonus(target: string, j: number): number {
  if (j === 0) return BONUS_BOUNDARY;
  const prev = target[j - 1];
  if (isWordSeparator(prev)) return BONUS_BOUNDARY;
  if (isLower(prev) && isUpper(target[j])) return BONUS_CAMEL;
  return 0;
}

function gapPenalty(k: number, j: number): number {
  // Gap between a match at k and the next match at j (k < j).
  if (k === j - 1) return 0;
  return PENALTY_GAP_START + (j - k - 2) * PENALTY_GAP_EXTEND;
}

function leadingPenalty(j: number): number {
  if (j === 0) return 0;
  return Math.max(
    PENALTY_GAP_START + (j - 1) * PENALTY_GAP_EXTEND,
    MAX_LEADING_PENALTY
  );
}

/**
 * Match `query` as a subsequence of `target`, case-insensitively. Returns null when it is
 * not a subsequence. Empty queries match with score 0 (callers decide what that means).
 */
export function fuzzyMatch(query: string, target: string): MatchResult | null {
  if (query.length === 0) return { score: 0, positions: [] };
  if (query.length > target.length) return null;

  const q = query.toLowerCase();
  const t = target.toLowerCase();
  const n = q.length;
  const m = t.length;

  // score[i][j]: best score with q[i] matched at t[j]. from[i][j]: previous match index.
  const score: number[][] = Array.from({ length: n }, () =>
    new Array<number>(m).fill(-Infinity)
  );
  const from: number[][] = Array.from({ length: n }, () =>
    new Array<number>(m).fill(-1)
  );

  for (let j = 0; j < m; j++) {
    if (q[0] !== t[j]) continue;
    score[0][j] =
      SCORE_MATCH +
      charBonus(target, j) +
      (j === 0 ? BONUS_FIRST_CHAR : 0) +
      leadingPenalty(j);
  }

  for (let i = 1; i < n; i++) {
    for (let j = i; j < m; j++) {
      if (q[i] !== t[j]) continue;
      for (let k = i - 1; k < j; k++) {
        if (score[i - 1][k] === -Infinity) continue;
        const consecutive = k === j - 1;
        const bonus = consecutive
          ? Math.max(BONUS_CONSECUTIVE, charBonus(target, j))
          : charBonus(target, j);
        const candidate =
          score[i - 1][k] + gapPenalty(k, j) + SCORE_MATCH + bonus;
        if (candidate > score[i][j]) {
          score[i][j] = candidate;
          from[i][j] = k;
        }
      }
    }
  }

  let best = -Infinity;
  let bestJ = -1;
  for (let j = 0; j < m; j++) {
    if (score[n - 1][j] > best) {
      best = score[n - 1][j];
      bestJ = j;
    }
  }
  if (bestJ === -1) return null;

  const positions = new Array<number>(n);
  let j = bestJ;
  for (let i = n - 1; i >= 0; i--) {
    positions[i] = j;
    j = from[i][j];
  }
  return { score: best, positions };
}
