import type { Link } from '@launcharr/core/types'
import { getVersion } from '@tauri-apps/api/app'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import {
  Bot,
  GripVertical,
  Info,
  Keyboard,
  LayoutGrid,
  Link2,
  PanelTop,
  Settings,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import {
  type BarZones,
  type Config,
  type ZoneName,
  normalizeBarZones,
  notchedZones,
} from '../lib/config'
import { applyTheme, themeNames } from '../lib/themes'
import DesktopTab from './DesktopTab'
import HotkeyRecorder from './HotkeyRecorder'
import iconUrl from './launcharr.svg'

/**
 * The settings window: a live view over config.json. Every edit autosaves (debounced);
 * the config watcher hot-applies everything (hotkey, shortcuts, login item, links,
 * bookmarks). The file stays the source of truth — hand-edits keep working and update
 * this window while it's open.
 */

const TABS = [
  { id: 'general', label: 'General', icon: Settings },
  { id: 'menubar', label: 'Menubar', icon: PanelTop },
  { id: 'desktop', label: 'Desktop', icon: LayoutGrid },
  { id: 'agents', label: 'Agents', icon: Bot },
  { id: 'quicklinks', label: 'Quicklinks', icon: Link2 },
  { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
  { id: 'about', label: 'About', icon: Info },
] as const

type TabId = (typeof TABS)[number]['id']

const SAVE_DEBOUNCE_MS = 400

export default function SettingsApp() {
  const [config, setConfig] = useState<Config | null>(null)
  // Deep link: `open_settings { tab }` puts the id in the URL hash for a fresh
  // window and emits `settings-tab` at an open one (the adopt prompt lands here).
  const [tab, setTab] = useState<TabId>(() => tabFromHash(window.location.hash))
  useEffect(() => {
    const un = listen<string>('settings-tab', (e) =>
      setTab(tabFromHash(e.payload)),
    )
    return () => {
      un.then((u) => u())
    }
  }, [])
  const [error, setError] = useState<string | null>(null)

  // Autosave plumbing: don't write back what we just loaded or received from the
  // watcher (echo), and don't let our own write's config-changed event clobber
  // edits typed during the round-trip.
  const skipWrite = useRef(true)
  const lastWritten = useRef<string | null>(null)

  useEffect(() => {
    invoke<Config>('read_config')
      .then((c) => {
        skipWrite.current = true
        setConfig(c)
      })
      .catch(console.error)
    const un = listen<Config>('config-changed', (e) => {
      if (JSON.stringify(e.payload) === lastWritten.current) return
      skipWrite.current = true
      setConfig(e.payload)
    })
    return () => {
      un.then((u) => u())
    }
  }, [])

  useEffect(() => {
    if (!config) return
    if (skipWrite.current) {
      skipWrite.current = false
      return
    }
    const t = setTimeout(() => {
      lastWritten.current = JSON.stringify(config)
      invoke('write_config', { config })
        .then(() => setError(null))
        .catch((e) => setError(String(e)))
    }, SAVE_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [config])

  useEffect(() => {
    if (config) applyTheme(config.theme, config.themes, 'settings')
  }, [config])

  if (!config) return <div className="settings" />

  const set = <K extends keyof Config>(key: K, value: Config[K]) =>
    setConfig({ ...config, [key]: value })

  return (
    <div className="settings">
      <nav className="tabstrip" data-tauri-drag-region>
        {TABS.map(({ id, label, icon: TabIcon }) => (
          <button
            key={id}
            className={`tab${tab === id ? ' active' : ''}`}
            onClick={() => setTab(id)}
          >
            <TabIcon size={18} strokeWidth={1.8} aria-hidden />
            {label}
          </button>
        ))}
      </nav>

      {error ? <div className="error-banner">{error}</div> : null}

      <main className="content">
        <div className="content-inner">
          {tab === 'general' && <GeneralTab config={config} set={set} />}
          {tab === 'menubar' && <MenubarTab config={config} set={set} />}
          {tab === 'desktop' && <DesktopTab config={config} set={set} />}
          {tab === 'agents' && <AgentsTab config={config} set={set} />}
          {tab === 'quicklinks' && <QuicklinksTab config={config} set={set} />}
          {tab === 'shortcuts' && <ShortcutsTab config={config} set={set} />}
          {tab === 'about' && <AboutTab />}
        </div>
      </main>
    </div>
  )
}

type SetFn = <K extends keyof Config>(key: K, value: Config[K]) => void

function tabFromHash(hash: string): TabId {
  const id = hash.replace(/^#/, '')
  return TABS.some((t) => t.id === id) ? (id as TabId) : 'general'
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

function GeneralTab({ config, set }: { config: Config; set: SetFn }) {
  return (
    <>
      <Row label="Summon hotkey">
        <HotkeyRecorder
          value={config.hotkey}
          onChange={(accel) => accel && set('hotkey', accel)}
        />
      </Row>
      <Row label="Startup">
        <label className="check">
          <input
            type="checkbox"
            checked={config.launchAtLogin}
            onChange={(e) => set('launchAtLogin', e.target.checked)}
          />
          Launch at login
        </label>
      </Row>
      <hr />
      <Row label="Theme">
        <select
          value={config.theme}
          onChange={(e) => set('theme', e.target.value)}
        >
          {themeNames(config.themes).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <p className="hint">
          Add your own under <code>"themes"</code> in config.json — partial
          overrides welcome.
        </p>
      </Row>
      <Row label="Prompt sigil">
        <input
          className="tiny"
          value={config.sigil}
          onChange={(e) => set('sigil', e.target.value)}
        />
      </Row>
      <Row label="Bang sigil">
        <input
          className="tiny"
          value={config.bangSigil}
          onChange={(e) => set('bangSigil', e.target.value)}
        />
      </Row>
      <Row label="Terminal">
        <select
          value={config.terminal}
          onChange={(e) =>
            set('terminal', e.target.value as Config['terminal'])
          }
        >
          <option value="iTerm2">iTerm2</option>
          <option value="Terminal">Terminal.app</option>
        </select>
      </Row>
      <Row label="Windows">
        <label className="check">
          <input
            type="checkbox"
            checked={config.bangNewWindow}
            onChange={(e) => set('bangNewWindow', e.target.checked)}
          />
          New window per command
        </label>
      </Row>
      <hr />
      <Row label="Hackables">
        <div className="buttonrow">
          <button
            className="ghost"
            onClick={() => invoke('open_path', { target: 'config' })}
          >
            edit config.json
          </button>
          <button
            className="ghost"
            onClick={() => invoke('open_path', { target: 'scripts' })}
          >
            open scripts folder
          </button>
        </div>
        <p className="hint">
          This whole window is a view over{' '}
          <code>~/.config/launcharr/config.json</code> — edit either place,
          changes apply live.
        </p>
      </Row>
    </>
  )
}

function QuicklinksTab({ config, set }: { config: Config; set: SetFn }) {
  const setLink = (i: number, patch: Partial<Link>) => {
    const links = config.links.slice()
    links[i] = { ...links[i]!, ...patch }
    set('links', links)
  }
  return (
    <>
      <p className="hint lead">
        Links open on Enter; add <code>{'{query}'}</code> to a URL to make it a
        quicklink with a trigger word.
      </p>
      {config.links.map((link, i) => (
        <div className="linkrow" key={i}>
          <input
            placeholder="name"
            value={link.name}
            onChange={(e) => setLink(i, { name: e.target.value })}
          />
          <input
            className="grow"
            placeholder="https://…"
            value={link.url}
            onChange={(e) => setLink(i, { url: e.target.value })}
          />
          <input
            className="small"
            placeholder="trigger"
            value={link.trigger ?? ''}
            onChange={(e) => setLink(i, { trigger: e.target.value || null })}
          />
          <button
            className="ghost"
            title="remove"
            onClick={() =>
              set(
                'links',
                config.links.filter((_, j) => j !== i),
              )
            }
          >
            ✕
          </button>
        </div>
      ))}
      <button
        className="ghost add"
        onClick={() => set('links', [...config.links, { name: '', url: '' }])}
      >
        + add link
      </button>
      <hr />
      <Row label="Fallback search">
        <input
          className="wide"
          value={config.searchFallback}
          onChange={(e) => set('searchFallback', e.target.value)}
        />
        <p className="hint">
          Opens when nothing matches; <code>{'{query}'}</code> is replaced with
          your input.
        </p>
      </Row>
      <Row label="Bookmarks">
        <label className="check">
          <input
            type="checkbox"
            checked={config.indexBookmarks}
            onChange={(e) => set('indexBookmarks', e.target.checked)}
          />
          Index browser bookmarks
        </label>
        <p className="hint">Chrome-family + Safari; local reads only.</p>
      </Row>
    </>
  )
}

function ShortcutsTab({ config, set }: { config: Config; set: SetFn }) {
  const entries = Object.entries(config.shortcuts)
  const setEntry = (i: number, keys: string, target: string) => {
    const next = entries.slice()
    next[i] = [keys, target]
    set('shortcuts', Object.fromEntries(next))
  }
  return (
    <>
      <p className="hint lead">
        Global hotkeys that launch an indexed item directly, without summoning
        the panel.
      </p>
      {entries.map(([keys, target], i) => (
        <div className="linkrow" key={i}>
          <HotkeyRecorder
            value={keys}
            onChange={(accel) => setEntry(i, accel ?? '', target)}
          />
          <input
            className="grow"
            placeholder="item name, e.g. Safari"
            value={target}
            onChange={(e) => setEntry(i, keys, e.target.value)}
          />
          <button
            className="ghost"
            title="remove"
            onClick={() => {
              const next = { ...config.shortcuts }
              delete next[keys]
              set('shortcuts', next)
            }}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        className="ghost add"
        onClick={() => set('shortcuts', { ...config.shortcuts, '': '' })}
      >
        + add shortcut
      </button>
    </>
  )
}

function AgentsTab({ config, set }: { config: Config; set: SetFn }) {
  const agents = config.agents
  const setAgents = (patch: Partial<Config['agents']>) =>
    set('agents', { ...agents, ...patch })
  return (
    <>
      <Row label="Local monitoring">
        <label className="check">
          <input
            type="checkbox"
            checked={agents.monitor}
            onChange={(e) => setAgents({ monitor: e.target.checked })}
          />
          Enable local agent monitoring
        </label>
        <p className="hint">
          Live session states in the bar and the <code>agents ⏎</code> panel.
          Agents report in over a local socket (Claude Code hooks →{' '}
          <code>agents.sock</code>); nothing leaves this machine.
        </p>
        {agents.monitor && (
          <>
            <label className="check">
              <input
                type="checkbox"
                checked={agents.showIdle}
                onChange={(e) => setAgents({ showIdle: e.target.checked })}
              />
              Show idle sessions in the bar
            </label>
            <label className="check">
              Forget sessions after{' '}
              <input
                className="tiny"
                type="number"
                min={1}
                max={168}
                value={agents.pruneHours}
                onChange={(e) =>
                  setAgents({
                    pruneHours: Math.max(1, Number(e.target.value) || 12),
                  })
                }
              />{' '}
              hours of silence
            </label>
          </>
        )}
      </Row>
      <hr />
      <Row label="Agent mode">
        <label className="check">
          <input
            type="checkbox"
            checked={agents.askMode}
            onChange={(e) => setAgents({ askMode: e.target.checked })}
          />
          Enable agent mode
        </label>
        <p className="hint">
          Activates the <code>?</code> command: press <code>?</code> in the
          launcher to converse with your own agent CLI — your subscription, your
          credentials. The spawned CLI is caged (empty working dir, tightest
          tool restrictions it offers); Enter sends, follow-ups keep context,
          Esc ends the conversation.
        </p>
        {agents.askMode && (
          <label className="check">
            Provider
            <select
              value={agents.askProvider}
              onChange={(e) =>
                setAgents({
                  askProvider: e.target
                    .value as Config['agents']['askProvider'],
                })
              }
            >
              <option value="claude">claude (Claude Code)</option>
              <option value="codex">codex (Codex CLI)</option>
            </select>
          </label>
        )}
      </Row>
      <hr />
      <Row label="Usage">
        <label className="check">
          <input
            type="checkbox"
            checked={agents.usage}
            onChange={(e) => setAgents({ usage: e.target.checked })}
          />
          Enable agent usage
        </label>
        <p className="hint">
          Activates the <code>usage ⏎</code> token monitor: tokens by day and
          model, read from the journals Claude Code and Codex already keep
          locally.
        </p>
        {agents.usage && (
          <>
            <p className="hint">
              Account limits (“how soon am I rate-limited?”) are computed by the
              providers, so showing them means one HTTPS request to each — using
              credentials the CLIs already store. Grant access per provider;
              launcharr picks the freshest source, falls back automatically, and
              never refreshes or writes tokens.
            </p>
            <label className="check">
              <input
                type="checkbox"
                checked={agents.claudeCreds}
                onChange={(e) => setAgents({ claudeCreds: e.target.checked })}
              />
              Claude — may read Claude Code’s stored credentials
            </label>
            <p className="hint">
              Credentials file first (silent); keychain when the file is stale —
              macOS shows its own prompt once.
            </p>
            <label className="check">
              <input
                type="checkbox"
                checked={agents.codexCreds}
                onChange={(e) => setAgents({ codexCreds: e.target.checked })}
              />
              Codex — may read <code>~/.codex/auth.json</code>
            </label>
            <p className="hint">
              Off = the panel shows this device’s last session snapshot only,
              which misses usage from your other machines.
            </p>
          </>
        )}
      </Row>
    </>
  )
}

const MODULE_LABELS: Record<string, string> = {
  workspaces: 'Workspaces (Aerospace)',
  agents: 'Agent monitors',
  frontApp: 'Active app',
  clock: 'Clock',
  wifi: 'Wi-Fi',
  awake: 'Awake (keep-alive)',
  battery: 'Battery',
}

const ZONE_LABELS: Record<ZoneName, string> = {
  left: 'Left',
  center: 'Center',
  right: 'Right',
}

/**
 * One column per alignment zone plus a "Retired" tray. Modules drag between
 * and within columns; ✕ retires a widget to the tray, dragging it back into a
 * zone restores it. Retirement is `enabled: false` in place — the bar already
 * skips disabled modules, so no schema change. Pure HTML5 DnD: the list
 * reorders live as the drag passes over rows, commits through onChange.
 */
function ZoneBoard({
  zones,
  zoneNames,
  onChange,
}: {
  zones: BarZones
  zoneNames: ZoneName[]
  onChange: (next: BarZones) => void
}) {
  const [dragId, setDragId] = useState<string | null>(null)

  const all = () => [...zones.left, ...zones.center, ...zones.right]
  const retired = all().filter((m) => !m.enabled)
  const without = (id: string): BarZones => ({
    left: zones.left.filter((m) => m.id !== id),
    center: zones.center.filter((m) => m.id !== id),
    right: zones.right.filter((m) => m.id !== id),
  })
  /** Drop the dragged module into `zone`, before `beforeId` (or at the end);
   * dropping restores a retired widget. */
  const placeAt = (zone: ZoneName, beforeId: string | null) => {
    const moved = all().find((m) => m.id === dragId)
    if (!moved || moved.id === beforeId) return
    const next = without(moved.id)
    const list = next[zone]
    const at = beforeId ? list.findIndex((m) => m.id === beforeId) : -1
    list.splice(at < 0 ? list.length : at, 0, { ...moved, enabled: true })
    onChange(next)
  }
  const retire = (id: string) => {
    const flip = (list: BarZones['left']) =>
      list.map((x) => (x.id === id ? { ...x, enabled: false } : x))
    onChange({
      left: flip(zones.left),
      center: flip(zones.center),
      right: flip(zones.right),
    })
  }

  const chip = (
    m: { id: string; enabled: boolean },
    inZone: ZoneName | null,
  ) => (
    <div
      key={m.id}
      className={`modrow ${m.id === dragId ? 'modrow-dragging' : ''} ${inZone ? '' : 'modrow-retired'}`}
      draggable
      onDragStart={(e) => {
        setDragId(m.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onDragEnter={(e) => {
        if (inZone) {
          e.stopPropagation()
          placeAt(inZone, m.id)
        }
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragEnd={() => setDragId(null)}
    >
      <GripVertical size={14} className="grip" aria-hidden />
      <span className="grow">{MODULE_LABELS[m.id] ?? m.id}</span>
      {inZone && (
        <button
          type="button"
          className="modx"
          title="retire widget"
          onClick={() => retire(m.id)}
        >
          ✕
        </button>
      )}
    </div>
  )

  return (
    <div className="zoneboard-wrap">
      <div
        className="zoneboard"
        style={{ gridTemplateColumns: `repeat(${zoneNames.length}, 1fr)` }}
      >
        {zoneNames.map((zone) => {
          const active = zones[zone].filter((m) => m.enabled)
          return (
            <div
              key={zone}
              className="zonecol"
              onDragOver={(e) => e.preventDefault()}
              onDragEnter={(e) => {
                // Only when entering the column's empty space, not a row.
                if (e.target === e.currentTarget) placeAt(zone, null)
              }}
              onDrop={(e) => {
                e.preventDefault()
                setDragId(null)
              }}
            >
              <div className="zonehead">{ZONE_LABELS[zone]}</div>
              {active.map((m) => chip(m, zone))}
              {active.length === 0 && (
                <div className="zoneempty">drop here</div>
              )}
            </div>
          )
        })}
      </div>
      <div
        className="zonetray"
        onDragOver={(e) => e.preventDefault()}
        onDragEnter={() => {
          if (dragId) retire(dragId)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setDragId(null)
        }}
      >
        <div className="zonehead">Retired</div>
        <div className="zonetray-chips">
          {retired.map((m) => chip(m, null))}
          {retired.length === 0 && (
            <div className="zoneempty">✕ a widget, or drag it here</div>
          )}
        </div>
      </div>
    </div>
  )
}

function MenubarTab({ config, set }: { config: Config; set: SetFn }) {
  const layout = normalizeBarZones(config.bar.layout)
  // Normalized + center-folded, so every module stays reachable on a board
  // that has no center column.
  const notched = config.bar.notchedLayout ? notchedZones(config.bar) : null
  return (
    <>
      <Row label="Menubar">
        <label className="check">
          <input
            type="checkbox"
            checked={config.bar.enabled}
            onChange={(e) =>
              set('bar', { ...config.bar, enabled: e.target.checked })
            }
          />
          Enable the launcharr bar
        </label>
        <p className="hint">
          Replaces the macOS menu bar with an Omarchy-style strip. Applies
          immediately.
        </p>
      </Row>
      <hr />
      {/* Boards break the 160px-label grid on purpose (Mitch, 2026-08-16):
          three drag columns need the whole content width. */}
      <section className="row-full">
        <div className="zonehead">Widgets</div>
        <p className="hint">
          Drag widgets between the zones; ✕ retires one to the tray below,
          dragging it back restores it.
        </p>
        <ZoneBoard
          zones={layout}
          zoneNames={['left', 'center', 'right']}
          onChange={(next) => set('bar', { ...config.bar, layout: next })}
        />
      </section>
      <hr />
      <section className="row-full">
        <div className="zonehead">Notched displays</div>
        <label className="check">
          <input
            type="checkbox"
            checked={notched !== null}
            onChange={(e) =>
              set('bar', {
                ...config.bar,
                // Seeded from what a notched display shows today (center
                // folded into right); unchecking falls back to that derivation.
                notchedLayout: e.target.checked
                  ? notchedZones(config.bar)
                  : null,
              })
            }
          />
          Separate arrangement for notched displays
        </label>
        <p className="hint">
          Notched displays have no center zone — the camera housing owns it.
        </p>
        {notched && (
          <ZoneBoard
            zones={notched}
            zoneNames={['left', 'right']}
            onChange={(next) =>
              set('bar', { ...config.bar, notchedLayout: next })
            }
          />
        )}
      </section>
    </>
  )
}

function AboutTab() {
  const [version, setVersion] = useState('')
  useEffect(() => {
    getVersion().then(setVersion).catch(console.error)
  }, [])
  return (
    <div className="about">
      <img className="appicon" src={iconUrl} alt="launcharr icon" />
      <p className="wordmark">
        <span className="sigil">❯</span> launcharr
        {version ? ` v${version}` : ''}
      </p>
      <p className="hint">An app launcher for pirates.</p>
    </div>
  )
}
