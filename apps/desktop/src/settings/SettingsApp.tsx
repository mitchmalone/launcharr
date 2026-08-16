import type { Link } from '@launcharr/core/types'
import { getVersion } from '@tauri-apps/api/app'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import {
  Bot,
  Info,
  Keyboard,
  Link2,
  PanelTop,
  Search,
  Settings,
  Terminal,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { BAR_MODULE_IDS, type Config } from '../lib/config'
import { applyTheme, themeNames } from '../lib/themes'
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
  { id: 'bang', label: 'Bang', icon: Terminal },
  { id: 'search', label: 'Search', icon: Search },
  { id: 'links', label: 'Links', icon: Link2 },
  { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
  { id: 'agents', label: 'Agents', icon: Bot },
  { id: 'menubar', label: 'Menubar', icon: PanelTop },
  { id: 'about', label: 'About', icon: Info },
] as const

type TabId = (typeof TABS)[number]['id']

const SAVE_DEBOUNCE_MS = 400

export default function SettingsApp() {
  const [config, setConfig] = useState<Config | null>(null)
  const [tab, setTab] = useState<TabId>('general')
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
        {tab === 'general' && <GeneralTab config={config} set={set} />}
        {tab === 'bang' && <BangTab config={config} set={set} />}
        {tab === 'search' && <SearchTab config={config} set={set} />}
        {tab === 'links' && <LinksTab config={config} set={set} />}
        {tab === 'shortcuts' && <ShortcutsTab config={config} set={set} />}
        {tab === 'agents' && <AgentsTab config={config} set={set} />}
        {tab === 'menubar' && <MenubarTab config={config} set={set} />}
        {tab === 'about' && <AboutTab />}
      </main>
    </div>
  )
}

type SetFn = <K extends keyof Config>(key: K, value: Config[K]) => void

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

function BangTab({ config, set }: { config: Config; set: SetFn }) {
  return (
    <>
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

function SearchTab({ config, set }: { config: Config; set: SetFn }) {
  return (
    <>
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

function LinksTab({ config, set }: { config: Config; set: SetFn }) {
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
          Activates the <code>?</code> command: type <code>?</code> plus a
          question in the launcher to converse with your own <code>claude</code>{' '}
          CLI — your subscription, your credentials. The spawned CLI is caged
          (empty working dir, no file or shell tools); Enter sends, follow-ups
          keep context, Esc ends the conversation.
        </p>
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
  clock: 'Clock (center anchor)',
  wifi: 'Wi-Fi',
  trmnl: 'TRMNL battery',
  battery: 'Battery',
}

function MenubarTab({ config, set }: { config: Config; set: SetFn }) {
  // Same normalization as the bar renderer: drop unknown ids, append missing.
  const known = new Set<string>(BAR_MODULE_IDS)
  const listed = config.bar.modules.filter((m) => known.has(m.id))
  const listedIds = new Set(listed.map((m) => m.id))
  const modules = [
    ...listed,
    ...BAR_MODULE_IDS.filter((id) => !listedIds.has(id)).map((id) => ({
      id: id as string,
      enabled: true,
    })),
  ]
  const save = (next: typeof modules) =>
    set('bar', { ...config.bar, modules: next })
  const move = (i: number, delta: number) => {
    const j = i + delta
    if (j < 0 || j >= modules.length) return
    const next = modules.slice()
    const a = next[i]
    const b = next[j]
    if (!a || !b) return
    next[i] = b
    next[j] = a
    save(next)
  }
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
      <Row label="Widgets">
        <p className="hint">
          Order is left → right; everything before the clock sits on the left,
          everything after it on the right.
        </p>
        {modules.map((m, i) => (
          <div className="linkrow" key={m.id}>
            <label className="check grow">
              <input
                type="checkbox"
                checked={m.enabled}
                onChange={(e) => {
                  const next = modules.slice()
                  next[i] = { ...m, enabled: e.target.checked }
                  save(next)
                }}
              />
              {MODULE_LABELS[m.id] ?? m.id}
            </label>
            <button
              className="ghost"
              title="move up"
              disabled={i === 0}
              onClick={() => move(i, -1)}
            >
              ↑
            </button>
            <button
              className="ghost"
              title="move down"
              disabled={i === modules.length - 1}
              onClick={() => move(i, 1)}
            >
              ↓
            </button>
          </div>
        ))}
      </Row>
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
