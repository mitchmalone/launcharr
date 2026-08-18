import {
  type DesktopConfig,
  bordersArgs,
  normalizeDesktop,
  renderAerospaceToml,
} from '@launcharr/core/desktop'
import { BAR_STRIP_HEIGHT } from '@launcharr/tui/bar'
import { invoke } from '@tauri-apps/api/core'

import type { Config } from './config'
import { resolveTheme } from './themes'

/**
 * Desktop layer glue (v0.4): turn config + theme into what Rust applies. TypeScript
 * decides (core renders the toml and the borders flags), `desktop_apply` in Rust
 * compares/writes/spawns/reloads. Idempotent — called at boot, on every
 * config-changed, and on theme change; nothing happens unless bytes differ.
 */

export type TomlState = 'absent' | 'managed' | 'foreign'

/** Mirrors `DepStatus` in deps.rs. */
export interface DepStatus {
  path: string | null
  version: string | null
}

/** Mirrors `DesktopStatus` in desktop.rs. */
export interface DesktopStatus {
  aerospace: DepStatus
  borders: DepStatus
  brew: boolean
  toml: TomlState
  tomlPath: string
  bordersRunning: boolean
  cornerRadius: number | null
  menuBarHidden: boolean
}

/** Mirrors `ApplyResult` in desktop.rs. */
export interface ApplyResult {
  toml: TomlState
  tomlWritten: boolean
  aerospaceReloaded: boolean
  bordersRunning: boolean
}

/** Mirrors `InstallEvent` in deps.rs (`desktop-install` event). */
export interface InstallEvent {
  dep: 'aerospace' | 'borders'
  line: string | null
  done: boolean | null
}

/** Mirrors `TomlAction` in desktop.rs — the unmanaged-config hand-offs. */
export type TomlAction =
  { kind: 'useExisting' } | { kind: 'saveAs'; toml: string }

export function desktopOf(config: Config): DesktopConfig {
  return normalizeDesktop(config.desktop)
}

/** What the machine contributes to the plan: things config can't know. */
export interface DesktopEnv {
  /** Native menu bar auto-hides (`desktop_status.menuBarHidden`). */
  menuBarHidden: boolean
}

/** What Rust should make true right now, from this config. Exported for tests. */
export function planDesktop(
  config: Config,
  env: DesktopEnv = { menuBarHidden: true },
): {
  toml: string | null
  bordersArgs: string[] | null
} {
  const d = desktopOf(config)
  const theme = resolveTheme(config.theme, config.themes)
  const toml =
    d.tiling.enabled && d.tiling.managed
      ? renderAerospaceToml(d, {
          barHeight: config.bar.enabled ? BAR_STRIP_HEIGHT : 0,
          menuBarHidden: env.menuBarHidden,
        })
      : null
  const borders =
    d.tiling.enabled && d.borders.enabled
      ? bordersArgs(d, { accent: theme.accent, dim: theme.dim, bg: theme.bg })
      : null
  return { toml, bordersArgs: borders }
}

/** Reads the menu-bar state first: the top gap depends on whether the native bar
 * is showing (visibleFrame already excludes it) — see gapPlan in core. */
export async function applyDesktop(config: Config): Promise<ApplyResult> {
  const status = await desktopStatus().catch(() => null)
  const env: DesktopEnv = { menuBarHidden: status?.menuBarHidden ?? true }
  return invoke<ApplyResult>('desktop_apply', { req: planDesktop(config, env) })
}

export function desktopStatus(): Promise<DesktopStatus> {
  return invoke<DesktopStatus>('desktop_status')
}
