import {
  CORNER_RADIUS_MAX,
  CORNER_RADIUS_MIN,
  type DesktopConfig,
  MODIFIERS,
  type Modifier,
  clampCornerRadius,
} from '@launcharr/core/desktop'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { Config } from '../lib/config'
import {
  type DesktopStatus,
  type InstallEvent,
  type TomlAction,
  applyDesktop,
  desktopOf,
  desktopStatus,
  planDesktop,
} from '../lib/desktop'
import SubTabs from './SubTabs'

/**
 * Settings → Desktop (v0.4, plans/done/v0.4-desktop-aerospace-borders.md): the
 * few knobs launcharr exposes over AeroSpace + JankyBorders, the install rows for
 * either tool when it is missing, the adopt-or-leave choice for a hand-written
 * aerospace.toml, and the system corner-radius slider. Everything else about
 * tiling is opinion; `managed` off hands the file back to a text editor.
 */

type SetFn = <K extends keyof Config>(key: K, value: Config[K]) => void

const SUBTABS = [
  { id: 'tiling', label: 'AeroSpace + JankyBorders' },
  { id: 'macos', label: 'macOS adjustments' },
] as const
type SubTab = (typeof SUBTABS)[number]['id']

const MODIFIER_LABELS: Record<Modifier, string> = {
  alt: '⌥ option',
  ctrl: '⌃ control',
  cmd: '⌘ command',
  'ctrl-alt': '⌃⌥ control + option',
  'alt-shift': '⌥⇧ option + shift',
}

export default function DesktopTab({
  config,
  set,
}: {
  config: Config
  set: SetFn
}) {
  const [sub, setSub] = useState<SubTab>('tiling')
  const desktop = desktopOf(config)
  const setDesktop = (patch: Partial<DesktopConfig>) =>
    set('desktop', { ...desktop, ...patch })
  const setTiling = (patch: Partial<DesktopConfig['tiling']>) =>
    setDesktop({ tiling: { ...desktop.tiling, ...patch } })
  const setBorders = (patch: Partial<DesktopConfig['borders']>) =>
    setDesktop({ borders: { ...desktop.borders, ...patch } })

  const [status, setStatus] = useState<DesktopStatus | null>(null)
  const refresh = useCallback(() => {
    desktopStatus().then(setStatus).catch(console.error)
  }, [])
  useEffect(() => {
    refresh()
    // Re-probe as the config round-trips (the panel webview applies it) so
    // "borders running" and the toml state stay truthful.
    const t = setInterval(refresh, 3000)
    return () => clearInterval(t)
  }, [refresh, config])

  // Install progress: one line at a time from `brew`, last one carries done.
  const [installing, setInstalling] = useState<InstallEvent['dep'] | null>(null)
  const [installLine, setInstallLine] = useState<string | null>(null)
  const [installError, setInstallError] = useState<string | null>(null)
  useEffect(() => {
    const un = listen<InstallEvent>('desktop-install', (e) => {
      if (e.payload.line) setInstallLine(e.payload.line)
      if (e.payload.done !== null) {
        setInstalling(null)
        setInstallLine(null)
        if (!e.payload.done)
          setInstallError(
            `brew install failed — see the last lines above; try it in a terminal.`,
          )
        refresh()
        // A freshly installed AeroSpace/borders should be picked up now.
        applyDesktop(config).catch(console.error)
      }
    })
    return () => {
      un.then((u) => u())
    }
  }, [refresh, config])
  const install = (dep: InstallEvent['dep']) => {
    setInstallError(null)
    setInstalling(dep)
    setInstallLine('starting brew…')
    invoke('desktop_install', { dep }).catch((e) => {
      setInstalling(null)
      setInstallLine(null)
      setInstallError(String(e?.detail ?? e))
    })
  }

  // Corner radius: applied on release (not every drag tick), read back for truth.
  const [radiusDraft, setRadiusDraft] = useState<number | null>(null)
  const radiusBusy = useRef(false)
  const commitRadius = (value: number | null) => {
    if (radiusBusy.current) return
    radiusBusy.current = true
    invoke('desktop_corner_radius', { radius: value })
      .then(() => setDesktop({ cornerRadius: value }))
      .catch((e) => setInstallError(String(e?.detail ?? e)))
      .finally(() => {
        radiusBusy.current = false
        setRadiusDraft(null)
        refresh()
      })
  }
  const shownRadius = radiusDraft ?? desktop.cornerRadius

  const aerospaceMissing = status !== null && status.aerospace.path === null
  const bordersMissing = status !== null && status.borders.path === null

  return (
    <>
      <SubTabs tabs={SUBTABS} value={sub} onChange={setSub} />

      {sub === 'tiling' && (
        <>
          <p className="hint lead">
            launcharr sets up window tiling (AeroSpace) and, if you want them,
            window borders (JankyBorders) — preconfigured, a few knobs here, the
            whole file yours the moment you stop letting launcharr manage it.
          </p>

          <Row label="Tiling">
            <label className="check">
              <input
                type="checkbox"
                checked={desktop.tiling.enabled}
                onChange={(e) => setTiling({ enabled: e.target.checked })}
              />
              Tile windows with AeroSpace
            </label>
            {status && (
              <p className="hint">
                {status.aerospace.path
                  ? `AeroSpace ${status.aerospace.version ?? ''} at ${status.aerospace.path}`
                  : 'AeroSpace is not installed.'}
              </p>
            )}
            {aerospaceMissing && (
              <InstallRow
                what="AeroSpace"
                dep="aerospace"
                brew={status?.brew ?? false}
                command="brew install --cask nikitabobko/tap/aerospace"
                installing={installing}
                line={installLine}
                onInstall={install}
              />
            )}
          </Row>

          {desktop.tiling.enabled &&
            status?.toml === 'foreign' &&
            desktop.tiling.managed && (
              <Row label="Existing config">
                <p className="hint" style={{ marginTop: 0 }}>
                  You already have a hand-written <code>{status.tomlPath}</code>
                  . launcharr won&apos;t touch it until you choose:
                </p>
                <div className="buttonrow">
                  <button
                    className="ghost"
                    onClick={() =>
                      invoke<string>('desktop_adopt')
                        .then(() => applyDesktop(config))
                        .then(refresh)
                        .catch((e) => setInstallError(String(e?.detail ?? e)))
                    }
                  >
                    use launcharr&apos;s (backs yours up)
                  </button>
                  <button
                    className="ghost"
                    onClick={() => setTiling({ managed: false })}
                  >
                    keep mine
                  </button>
                </div>
              </Row>
            )}

          {desktop.tiling.enabled && (
            <>
              <Row label="Config">
                <label className="check">
                  <input
                    type="checkbox"
                    checked={desktop.tiling.managed}
                    onChange={(e) => setTiling({ managed: e.target.checked })}
                  />
                  Let launcharr manage AeroSpace
                </label>
              </Row>
              {!desktop.tiling.managed && (
                <TomlRow
                  status={status}
                  config={config}
                  onError={setInstallError}
                  onDone={refresh}
                />
              )}
              {desktop.tiling.managed && (
                <>
                  <Row label="Modifier">
                    <select
                      value={desktop.tiling.modifier}
                      onChange={(e) =>
                        setTiling({ modifier: e.target.value as Modifier })
                      }
                    >
                      {MODIFIERS.map((m) => (
                        <option key={m} value={m}>
                          {MODIFIER_LABELS[m]}
                        </option>
                      ))}
                    </select>
                    <p className="hint">
                      Prefix for every tiling key: focus h/j/k/l, move ⇧h/j/k/l,
                      workspaces 1–9, f fullscreen, r resize mode, ; service
                      mode.
                    </p>
                  </Row>
                  <Row label="Gaps">
                    <input
                      className="tiny"
                      type="number"
                      min={0}
                      max={64}
                      value={desktop.tiling.gaps}
                      onChange={(e) =>
                        setTiling({ gaps: Number(e.target.value) })
                      }
                    />{' '}
                    px
                  </Row>
                  <Row label="Workspaces">
                    <input
                      className="tiny"
                      type="number"
                      min={1}
                      max={9}
                      value={desktop.tiling.workspaces}
                      onChange={(e) =>
                        setTiling({ workspaces: Number(e.target.value) })
                      }
                    />
                    <p className="hint">
                      Workspaces 1–N stay listed even when empty; keys 1–9
                      always work.
                    </p>
                  </Row>
                </>
              )}
            </>
          )}

          <hr />

          <Row label="Window borders">
            {bordersMissing ? (
              <>
                <p className="hint" style={{ marginTop: 0 }}>
                  Highlights the focused window (JankyBorders, GPL-3 — installed
                  via Homebrew, never bundled).
                </p>
                <InstallRow
                  what="JankyBorders"
                  dep="borders"
                  brew={status?.brew ?? false}
                  command="brew install felixkratz/formulae/borders"
                  installing={installing}
                  line={installLine}
                  onInstall={install}
                />
              </>
            ) : (
              <>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={desktop.borders.enabled}
                    disabled={!desktop.tiling.enabled}
                    onChange={(e) => setBorders({ enabled: e.target.checked })}
                  />
                  Draw a border around the focused window
                </label>
                {status && (
                  <p className="hint">
                    JankyBorders {status.borders.version ?? ''}
                    {status.bordersRunning ? ' · running' : ''}
                    {!desktop.tiling.enabled ? ' · needs tiling on' : ''}
                  </p>
                )}
                {desktop.borders.enabled && (
                  <>
                    <label className="check">
                      Width{' '}
                      <input
                        className="tiny"
                        type="number"
                        min={1}
                        max={20}
                        step={0.5}
                        value={desktop.borders.width}
                        onChange={(e) =>
                          setBorders({ width: Number(e.target.value) })
                        }
                      />{' '}
                      px
                    </label>
                    <label className="check">
                      Style{' '}
                      <select
                        value={desktop.borders.style}
                        onChange={(e) =>
                          setBorders({
                            style:
                              e.target.value === 'square' ? 'square' : 'round',
                          })
                        }
                      >
                        <option value="round">round</option>
                        <option value="square">square</option>
                      </select>
                    </label>
                    <p className="hint">
                      Colours follow the theme: accent when focused, dim
                      otherwise.
                    </p>
                  </>
                )}
              </>
            )}
          </Row>
        </>
      )}

      {sub === 'macos' && (
        <Row label="Window corners">
          <label className="check">
            <input
              type="checkbox"
              checked={desktop.cornerRadius !== null}
              onChange={(e) => commitRadius(e.target.checked ? 10 : null)}
            />
            Override macOS&apos;s window corner radius
          </label>
          {desktop.cornerRadius !== null && (
            <label className="check">
              <input
                type="range"
                min={CORNER_RADIUS_MIN}
                max={CORNER_RADIUS_MAX}
                step={1}
                value={shownRadius ?? 10}
                onChange={(e) =>
                  setRadiusDraft(clampCornerRadius(Number(e.target.value)))
                }
                onMouseUp={() =>
                  radiusDraft !== null && commitRadius(radiusDraft)
                }
                onKeyUp={() =>
                  radiusDraft !== null && commitRadius(radiusDraft)
                }
                onTouchEnd={() =>
                  radiusDraft !== null && commitRadius(radiusDraft)
                }
              />{' '}
              {shownRadius ?? 10}px
            </label>
          )}
          <p className="hint">
            Sets a hidden system default (<code>NSConvolutionOverride1</code>);
            apps pick it up when they relaunch, Finder after a logout.
            Undocumented by Apple — it may stop working on a future macOS. 10 is
            the pre-Tahoe look
            {status?.cornerRadius !== null && status?.cornerRadius !== undefined
              ? `; currently ${status.cornerRadius}`
              : ''}
            .
          </p>
        </Row>
      )}

      {installError && (
        <p className="hint" style={{ color: 'var(--danger)' }}>
          {installError}
        </p>
      )}
    </>
  )
}

/**
 * Unmanaged: the file is yours. Show what's at the canonical path and offer the
 * two hand-offs — point it at a toml you already keep (symlink), or save
 * launcharr's config somewhere as a starting point (then it's yours).
 */
function TomlRow({
  status,
  config,
  onError,
  onDone,
}: {
  status: DesktopStatus | null
  config: Config
  onError: (e: string | null) => void
  onDone: () => void
}) {
  const [busy, setBusy] = useState(false)
  const run = (action: TomlAction) => {
    setBusy(true)
    onError(null)
    invoke<string | null>('desktop_toml', { action })
      .then(() => onDone())
      .catch((e) => onError(String(e?.detail ?? e)))
      .finally(() => setBusy(false))
  }
  const state = status?.toml
  const path = status?.tomlPath ?? '~/.config/aerospace/aerospace.toml'
  return (
    <Row label="Config file">
      <p className="hint" style={{ marginTop: 0 }}>
        {state === 'absent' && (
          <>
            Nothing at <code>{path}</code> yet — AeroSpace runs on its defaults.
          </>
        )}
        {state === 'foreign' && (
          <>
            <code>{path}</code> is yours; launcharr won&apos;t touch it.
          </>
        )}
        {state === 'managed' && (
          <>
            <code>{path}</code> is the last file launcharr wrote — yours now.
          </>
        )}
      </p>
      <div className="buttonrow">
        {state !== 'absent' && (
          <button
            className="ghost"
            onClick={() =>
              invoke('open_path', { target: 'aerospace-toml' }).catch((e) =>
                onError(String(e?.detail ?? e)),
              )
            }
          >
            edit
          </button>
        )}
        <button
          className="ghost"
          disabled={busy}
          onClick={() => run({ kind: 'useExisting' })}
        >
          use my own config…
        </button>
        <button
          className="ghost"
          disabled={busy}
          onClick={() => {
            const toml = planDesktop({
              ...config,
              desktop: {
                ...desktopOf(config),
                tiling: { ...desktopOf(config).tiling, managed: true },
              },
            }).toml
            if (toml) run({ kind: 'saveAs', toml })
          }}
        >
          save a copy to edit…
        </button>
      </div>
      <p className="hint">
        &ldquo;Use my own config&rdquo; symlinks <code>{path}</code> to the file
        you pick (dotfiles-friendly; anything already there is backed up).
        &ldquo;Save a copy&rdquo; writes launcharr&apos;s config where you
        choose and links to it — a starting point that&apos;s yours from then
        on.
      </p>
    </Row>
  )
}

function InstallRow({
  what,
  dep,
  brew,
  command,
  installing,
  line,
  onInstall,
}: {
  what: string
  dep: InstallEvent['dep']
  brew: boolean
  command: string
  installing: InstallEvent['dep'] | null
  line: string | null
  onInstall: (dep: InstallEvent['dep']) => void
}) {
  if (installing === dep) {
    return (
      <p className="hint">
        Installing {what}… <code>{line ?? ''}</code>
      </p>
    )
  }
  if (!brew) {
    return (
      <p className="hint">
        Homebrew isn&apos;t installed. Get it from <code>https://brew.sh</code>,
        then run <code>{command}</code>.
      </p>
    )
  }
  return (
    <div className="buttonrow">
      <button
        className="ghost"
        disabled={installing !== null}
        onClick={() => onInstall(dep)}
      >
        install {what} via Homebrew
      </button>
    </div>
  )
}

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="row">
      <div className="rowlabel">{label}</div>
      <div className="rowcontrol">{children}</div>
    </div>
  )
}
