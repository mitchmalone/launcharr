export function frecencyMultiplier(frecency: number | undefined): number {
  if (!frecency || frecency <= 0) return 1
  return 1 + (0.5 * frecency) / (frecency + 5)
}
