import type {
  AwakeReading,
  AwakeState,
  TriggerState,
} from '@launcharr/core/awake'
import {
  evaluate,
  neededReadings,
  needsWatching,
  parseSpec,
} from '@launcharr/core/awake'
import { invoke } from '@tauri-apps/api/core'

/** Mirrors AwakeReadings in commands.rs. */
export interface AwakeReadings {
  state: AwakeState
  reading: AwakeReading
}

/**
 * Carried between watch ticks: reducer state plus the spec it belongs to,
 * so a re-arm resets the hysteresis clocks.
 */
export interface AwakeWatchMemory {
  spec: string | null
  trigger: TriggerState | null
  inflight: boolean
}

export const freshAwakeMemory = (): AwakeWatchMemory => ({
  spec: null,
  trigger: null,
  inflight: false,
})

/**
 * One watch tick: sample readings, run the pure reducer, release when it says
 * so. Rust never interprets the session — this is where the product's release
 * semantics actually run. The expensive readings flags come from the *last*
 * seen spec; the first tick after an arm evaluates without them (which holds,
 * by the fail-toward-holding rule) and the next tick has them.
 *
 * The bar window calls this on every Rust-pushed snapshot while a session is
 * armed; the launcher window runs a slow fallback interval when the bar is
 * off. Both may run — release is idempotent.
 */
export async function awakeWatchTick(mem: AwakeWatchMemory): Promise<void> {
  if (mem.inflight) return
  mem.inflight = true
  try {
    const lastSpec = parseSpec(mem.spec)
    const need = lastSpec
      ? neededReadings(lastSpec.until)
      : { apps: false, display: false, net: false }
    const { state, reading } = await invoke<AwakeReadings>('awake_readings', {
      apps: need.apps,
      display: need.display,
      net: need.net,
    })
    if (!state.armed || !state.spec) {
      mem.spec = null
      mem.trigger = null
      return
    }
    if (mem.spec !== state.spec) {
      // New session (or first sight of this one): fresh hysteresis clocks.
      mem.spec = state.spec
      mem.trigger = null
    }
    const spec = parseSpec(state.spec)
    if (!spec || !needsWatching(spec.until)) return
    const verdict = evaluate(spec.until, reading, mem.trigger)
    mem.trigger = verdict.state
    if (verdict.release) {
      mem.spec = null
      mem.trigger = null
      await invoke('awake_release')
    }
  } finally {
    mem.inflight = false
  }
}
