/* eslint-disable no-console */
/**
 * Keystroke→results instrumentation (PRD §7: < 16ms, one frame). Marks the moment input
 * changes; reports once the resulting render has committed. Console-only by design — visible
 * in the webview inspector or `pnpm tauri dev`, free in daily use.
 */

let inputMarkedAt: number | null = null

export function markInput(): void {
  inputMarkedAt = performance.now()
}

export function reportResultsPainted(resultCount: number): void {
  if (inputMarkedAt === null) return
  const elapsed = performance.now() - inputMarkedAt
  inputMarkedAt = null
  console.log(
    `[launcharr perf] keystroke→results ${elapsed.toFixed(1)}ms (${resultCount} rows)`,
  )
}
