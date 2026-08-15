/**
 * List selection movement: the one nav primitive every menu, list, and picker
 * shares. Pure — components own the state, this owns the arithmetic.
 */

export function moveSelection(
  index: number,
  count: number,
  delta: number,
  wrap = true,
): number {
  if (count <= 0) return -1
  if (index < 0 || index >= count) return 0
  const next = index + delta
  if (wrap) return ((next % count) + count) % count
  return Math.min(count - 1, Math.max(0, next))
}
