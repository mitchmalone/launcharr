/**
 * Slider arithmetic: step lattice + clamping for keyboard-driven sliders.
 */

/** Move `value` by `deltaSteps` increments of `step`, snapped and clamped. */
export function stepValue(
  value: number,
  min: number,
  max: number,
  step: number,
  deltaSteps: number,
): number {
  const steps = (value - min) / step
  const snapped =
    deltaSteps >= 0
      ? Math.floor(steps + 1e-9) + deltaSteps
      : Math.ceil(steps - 1e-9) + deltaSteps
  const next = min + snapped * step
  const clamped = Math.min(max, Math.max(min, next))
  // Kill float noise (0.6000000000000001-style) at sensible precision.
  return Math.round(clamped * 1e9) / 1e9
}

/** Position of `value` on the track, 0..1 (degenerate ranges pin to 0). */
export function sliderRatio(value: number, min: number, max: number): number {
  if (max <= min) return 0
  return Math.min(1, Math.max(0, (value - min) / (max - min)))
}
