import type { Link } from '@launcharr/core/types'
import type { BarSnapshot, BarWidget } from '@launcharr/tui'
import { GithubIcon, XIcon } from '@launcharr/tui/icons'
import { getVersion } from '@tauri-apps/api/app'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import {
  BookOpen,
  Bot,
  Globe,
  GripVertical,
  Info,
  LayoutGrid,
  Link2,
  PanelTop,
  Settings,
  Tag,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import {
  type BarZones,
  type Config,
  type ZoneName,
  normalizeBarZones,
  notchedZones,
  widgetModuleId,
} from '../lib/config'
import { applyTheme, themeNames } from '../lib/themes'
import DesktopTab from './DesktopTab'
import HotkeyRecorder from './HotkeyRecorder'
import SubTabs from './SubTabs'
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
  { id: 'about', label: 'About', icon: Info },
] as const

/** Where launcharr lives on the web — the About tab's links. */
const SITE_URL = 'https://launcharr.com'
const DOCS_URL = 'https://launcharr.com/docs'
const GITHUB_URL = 'https://github.com/mitchmalone/launcharr'
const RELEASES_URL = `${GITHUB_URL}/releases`
const X_URL = 'https://x.com/mitchmalone'

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

const GENERAL_SUBTABS = [
  { id: 'general', label: 'General' },
  { id: 'colorpicker', label: 'Color picker' },
  { id: 'config', label: 'Config' },
] as const
type GeneralSubTab = (typeof GENERAL_SUBTABS)[number]['id']

/** Settings → General: the basics, then the two rows that had grown into pages. */
function GeneralTab({ config, set }: { config: Config; set: SetFn }) {
  const [sub, setSub] = useState<GeneralSubTab>('general')
  return (
    <>
      <SubTabs tabs={GENERAL_SUBTABS} value={sub} onChange={setSub} />
      {sub === 'general' && <GeneralBasics config={config} set={set} />}
      {sub === 'colorpicker' && (
        <ColorPickerSection config={config} set={set} />
      )}
      {sub === 'config' && <ConfigSection />}
    </>
  )
}

function GeneralBasics({ config, set }: { config: Config; set: SetFn }) {
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
    </>
  )
}

function ColorPickerSection({ config, set }: { config: Config; set: SetFn }) {
  return (
    <>
      <Row label="Color picker">
        <label className="check">
          <input
            type="checkbox"
            checked={config.colorLoupe}
            onChange={(e) => set('colorLoupe', e.target.checked)}
          />
          Use the launcharr loupe
        </label>
        {config.colorLoupe && (
          <label className="check">
            Zoom
            <select
              value={String(config.colorLoupeZoom)}
              onChange={(e) => set('colorLoupeZoom', Number(e.target.value))}
            >
              {[2, 3, 4, 6, 8].map((z) => (
                <option key={z} value={z}>
                  {z}×
                </option>
              ))}
            </select>{' '}
            Size
            <select
              value={String(config.colorLoupeSize)}
              onChange={(e) => set('colorLoupeSize', Number(e.target.value))}
            >
              {[176, 264, 352, 440, 528].map((d) => (
                <option key={d} value={d}>
                  {d}px
                </option>
              ))}
            </select>
          </label>
        )}
        <p className="hint">
          Off (default): <code>colorpicker</code> uses Apple's own sampler — no
          permission, its zoom. On: launcharr draws its own loupe, which needs{' '}
          <strong>Screen Recording</strong> — the first pick after switching
          asks macOS once; grant it, relaunch launcharr, and picks use the
          loupe. Flip back any time to compare.
        </p>
      </Row>
    </>
  )
}

function ConfigSection() {
  return (
    <>
      <Row label="Config">
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

const AGENT_SUBTABS = [
  { id: 'mode', label: 'Agent mode' },
  { id: 'local', label: 'Local monitoring' },
  { id: 'usage', label: 'Usage monitoring' },
] as const
type AgentSubTab = (typeof AGENT_SUBTABS)[number]['id']

/** Settings → Agents: three sub-tabs, one per feature the tab used to stack. */
function AgentsTab({ config, set }: { config: Config; set: SetFn }) {
  const [sub, setSub] = useState<AgentSubTab>('mode')
  const agents = config.agents
  const setAgents = (patch: Partial<Config['agents']>) =>
    set('agents', { ...agents, ...patch })
  return (
    <>
      <SubTabs tabs={AGENT_SUBTABS} value={sub} onChange={setSub} />
      {sub === 'mode' && (
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
            launcher to converse with your own agent CLI — your subscription,
            your credentials. The spawned CLI is caged (empty working dir,
            tightest tool restrictions it offers); Enter sends, follow-ups keep
            context, Esc ends the conversation.
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
      )}
      {sub === 'local' && (
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
      )}
      {sub === 'usage' && (
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
                Account limits (“how soon am I rate-limited?”) are computed by
                the providers, so showing them means one HTTPS request to each —
                using credentials the CLIs already store. Grant access per
                provider; launcharr picks the freshest source, falls back
                automatically, and never refreshes or writes tokens.
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
                Credentials file first (silent); keychain when the file is stale
                — macOS shows its own prompt once.
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
      )}
    </>
  )
}

const MODULE_LABELS: Record<string, string> = {
  workspaces: 'AeroSpace',
  agents: 'Agent monitors',
  frontApp: 'Active app',
  clock: 'Clock',
  wifi: 'Wi-Fi',
  awake: 'Awake (keep-alive)',
  battery: 'Battery',
}

/** Built-ins by name; a user widget (`widget:<id>`, docs/WIDGETS.md) shows
 * its manifest name when the live set knows it, else its id. */
const moduleLabel = (id: string, widgets: BarWidget[]) => {
  if (MODULE_LABELS[id]) return MODULE_LABELS[id]
  if (!id.startsWith('widget:')) return id
  const wid = id.slice('widget:'.length)
  const w = widgets.find((w) => w.id === wid)
  return `${w?.name ?? wid} · widget`
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
  widgets,
  onChange,
}: {
  zones: BarZones
  zoneNames: ZoneName[]
  /** The live user widgets, for labels. */
  widgets: BarWidget[]
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
      <span className="grow">{moduleLabel(m.id, widgets)}</span>
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

/**
 * The live user widgets (docs/WIDGETS.md), polled from the bar snapshot while
 * the Menubar tab is open — an in-memory read Rust-side, so 2 s is cheap, and
 * it lets the board and the widgets list follow adds/removes/ticks live.
 */
function useWidgets(): BarWidget[] {
  const [widgets, setWidgets] = useState<BarWidget[]>([])
  useEffect(() => {
    let live = true
    const pull = () =>
      invoke<BarSnapshot>('bar_snapshot')
        .then((s) => live && setWidgets(s.widgets ?? []))
        .catch(console.error)
    pull()
    const t = window.setInterval(pull, 2000)
    return () => {
      live = false
      window.clearInterval(t)
    }
  }, [])
  return widgets
}

/** "ok · 3m ago" / "error · exit 1 …" / "hidden" / "waiting" for the list. */
function widgetStatus(w: BarWidget, now: number): string {
  const ago = (t: number) => {
    const s = Math.max(0, Math.round(now / 1000 - t))
    if (s < 60) return `${s}s ago`
    if (s < 3600) return `${Math.round(s / 60)}m ago`
    return `${Math.round(s / 3600)}h ago`
  }
  if (w.error) {
    return `error · ${w.error}${w.lastOk ? ` · last ok ${ago(w.lastOk)}` : ''}`
  }
  if (!w.view) return 'waiting for the first tick'
  const at = w.updatedAt ? ` · ${ago(w.updatedAt)}` : ''
  return w.view.hidden ? `hidden${at}` : `ok${at}`
}

type WidgetSource =
  { kind: 'url'; url: string } | { kind: 'file'; name: string; content: string }

/**
 * Custom widgets: what's installed and how it's doing, plus add (a picked file
 * — read in the webview, no dialog plugin — or a URL, one user-initiated
 * fetch) and remove. Layout lives on the board above; this is the inventory.
 */
function WidgetsSection({ widgets }: { widgets: BarWidget[] }) {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const now = Date.now()

  const install = (source: WidgetSource) => {
    setBusy(true)
    setNote(null)
    invoke<string>('widget_install', { source })
      .then((id) => {
        setNote(`installed ${id}`)
        setUrl('')
      })
      .catch((e) => setNote(String(e)))
      .finally(() => setBusy(false))
  }
  const pickFile = (file: File | undefined) => {
    if (!file) return
    file
      .text()
      .then((content) => install({ kind: 'file', name: file.name, content }))
      .catch((e) => setNote(String(e)))
  }
  const remove = (w: BarWidget) => {
    setNote(null)
    invoke('widget_remove', { id: w.id })
      .then(() => setNote(`removed ${w.id}`))
      .catch((e) => setNote(String(e)))
  }
  const tick = (w: BarWidget) =>
    invoke('widget_tick', { id: w.id }).catch(console.error)

  return (
    <section className="row-full">
      <div className="zonehead">Custom widgets</div>
      <p className="hint">
        Executables in <code>~/.config/launcharr/widgets/</code> that answer{' '}
        <code>manifest</code> and <code>tick</code> — any language, live, no
        restart. Contract and reference widgets: docs/WIDGETS.md.
      </p>
      {widgets.length === 0 && (
        <p className="hint">No custom widgets installed.</p>
      )}
      {widgets.map((w) => (
        <div className="linkrow" key={w.id}>
          <div className="grow widgetmeta">
            <span className="widgetname">{w.name}</span>
            <span className="widgetid">{widgetModuleId(w.id)}</span>
            <span
              className={`widgetstatus ${w.error ? 'widgetstatus-error' : ''}`}
              title={w.error ?? undefined}
            >
              {widgetStatus(w, now)}
            </span>
          </div>
          <button
            type="button"
            className="ghost"
            title="run the widget now"
            onClick={() => tick(w)}
          >
            tick
          </button>
          <button
            type="button"
            className="ghost"
            title="delete the widget file"
            onClick={() => remove(w)}
          >
            remove
          </button>
        </div>
      ))}
      <div className="linkrow widgetadd">
        <input
          type="text"
          className="grow"
          placeholder="https://…/widget.py — install from URL"
          value={url}
          disabled={busy}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && url.trim()) {
              install({ kind: 'url', url: url.trim() })
            }
          }}
        />
        <button
          type="button"
          className="ghost"
          disabled={busy || !url.trim()}
          onClick={() => install({ kind: 'url', url: url.trim() })}
        >
          install
        </button>
        <button
          type="button"
          className="ghost"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          add file…
        </button>
        <input
          ref={fileRef}
          type="file"
          hidden
          onChange={(e) => {
            pickFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        <button
          type="button"
          className="ghost"
          onClick={() => invoke('open_path', { target: 'widgets' })}
        >
          open folder
        </button>
      </div>
      {note && <p className="hint">{note}</p>}
    </section>
  )
}

const MENUBAR_SUBTABS = [
  { id: 'layout', label: 'Layout' },
  { id: 'widgets', label: 'Custom widgets' },
] as const
type MenubarSubTab = (typeof MENUBAR_SUBTABS)[number]['id']

/** Settings → Menubar: the strip + zone boards, and the custom-widget
 * inventory on its own sub-tab (Mitch, 2026-08-19: not jammed into the page). */
function MenubarTab({ config, set }: { config: Config; set: SetFn }) {
  const [sub, setSub] = useState<MenubarSubTab>('layout')
  const widgets = useWidgets()
  const homes = widgets.map((w) => ({ id: w.id, zone: w.zone }))
  const layout = normalizeBarZones(config.bar.layout, homes)
  // Normalized + center-folded, so every module stays reachable on a board
  // that has no center column.
  const notched = config.bar.notchedLayout
    ? notchedZones(config.bar, homes)
    : null
  return (
    <>
      <SubTabs tabs={MENUBAR_SUBTABS} value={sub} onChange={setSub} />
      {sub === 'widgets' && <WidgetsSection widgets={widgets} />}
      {sub === 'layout' && (
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
              dragging it back restores it. Custom widgets join here as soon as
              they're installed (next tab).
            </p>
            <ZoneBoard
              zones={layout}
              zoneNames={['left', 'center', 'right']}
              widgets={widgets}
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
                      ? notchedZones(config.bar, homes)
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
                widgets={widgets}
                onChange={(next) =>
                  set('bar', { ...config.bar, notchedLayout: next })
                }
              />
            )}
          </section>
        </>
      )}
    </>
  )
}

function AboutTab() {
  const [version, setVersion] = useState('')
  useEffect(() => {
    getVersion().then(setVersion).catch(console.error)
  }, [])
  const open = (url: string) => invoke('open_url', { url }).catch(console.error)
  const links: { label: string; url: string; icon: React.ReactNode }[] = [
    {
      label: 'launcharr.com',
      url: SITE_URL,
      icon: <Globe size={15} strokeWidth={1.75} aria-hidden />,
    },
    {
      label: 'docs',
      url: DOCS_URL,
      icon: <BookOpen size={15} strokeWidth={1.75} aria-hidden />,
    },
    { label: 'github', url: GITHUB_URL, icon: <GithubIcon size={15} /> },
    {
      label: 'releases',
      url: RELEASES_URL,
      icon: <Tag size={15} strokeWidth={1.75} aria-hidden />,
    },
    { label: '@mitchmalone', url: X_URL, icon: <XIcon size={15} /> },
  ]
  return (
    <div className="about">
      <img className="appicon" src={iconUrl} alt="launcharr icon" />
      <p className="wordmark">
        <span className="sigil">❯</span> launcharr
        {version ? ` v${version}` : ''}
      </p>
      <p className="hint">The keyboard control surface for macOS.</p>
      <p className="hint">
        An app launcher for pirates — by{' '}
        <button className="linkish" onClick={() => open(X_URL)}>
          Mitch Malone
        </button>
        .
      </p>
      <div className="aboutlinks">
        {links.map((l) => (
          <button key={l.url} className="ghost" onClick={() => open(l.url)}>
            {l.icon}
            {l.label}
          </button>
        ))}
      </div>
      <p className="hint aboutfoot">
        Zero granted permissions, zero network. Your config lives at{' '}
        <code>~/.config/launcharr/config.json</code>; scripts extend the prompt
        (see docs). Because the apps won’t launch themselves. Yarr.
      </p>
    </div>
  )
}
