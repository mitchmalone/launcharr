import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { listen } from '@tauri-apps/api/event';
import {
  Info,
  Keyboard,
  Link2,
  Search,
  Settings,
  Terminal,
} from 'lucide-react';

import { applyTheme, themeNames } from '../lib/themes';
import type { Config, Link } from '../lib/types';
import HotkeyRecorder from './HotkeyRecorder';
import iconUrl from './launcharr.svg';

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
  { id: 'about', label: 'About', icon: Info },
] as const;

type TabId = (typeof TABS)[number]['id'];

const SAVE_DEBOUNCE_MS = 400;

export default function SettingsApp() {
  const [config, setConfig] = useState<Config | null>(null);
  const [tab, setTab] = useState<TabId>('general');
  const [error, setError] = useState<string | null>(null);

  // Autosave plumbing: don't write back what we just loaded or received from the
  // watcher (echo), and don't let our own write's config-changed event clobber
  // edits typed during the round-trip.
  const skipWrite = useRef(true);
  const lastWritten = useRef<string | null>(null);

  useEffect(() => {
    invoke<Config>('read_config')
      .then((c) => {
        skipWrite.current = true;
        setConfig(c);
      })
      .catch(console.error);
    const un = listen<Config>('config-changed', (e) => {
      if (JSON.stringify(e.payload) === lastWritten.current) return;
      skipWrite.current = true;
      setConfig(e.payload);
    });
    return () => {
      un.then((u) => u());
    };
  }, []);

  useEffect(() => {
    if (!config) return;
    if (skipWrite.current) {
      skipWrite.current = false;
      return;
    }
    const t = setTimeout(() => {
      lastWritten.current = JSON.stringify(config);
      invoke('write_config', { config })
        .then(() => setError(null))
        .catch((e) => setError(String(e)));
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [config]);

  useEffect(() => {
    if (config) applyTheme(config.theme, config.themes, 'settings');
  }, [config]);

  if (!config) return <div className="settings" />;

  const set = <K extends keyof Config>(key: K, value: Config[K]) =>
    setConfig({ ...config, [key]: value });

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
        {tab === 'about' && <AboutTab />}
      </main>
    </div>
  );
}

type SetFn = <K extends keyof Config>(key: K, value: Config[K]) => void;

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="row">
      <div className="rowlabel">{label}</div>
      <div className="rowcontrol">{children}</div>
    </div>
  );
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
          This whole window is a view over <code>~/.launcharr/config.json</code>{' '}
          — edit either place, changes apply live.
        </p>
      </Row>
    </>
  );
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
  );
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
  );
}

function LinksTab({ config, set }: { config: Config; set: SetFn }) {
  const setLink = (i: number, patch: Partial<Link>) => {
    const links = config.links.slice();
    links[i] = { ...links[i], ...patch };
    set('links', links);
  };
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
                config.links.filter((_, j) => j !== i)
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
  );
}

function ShortcutsTab({ config, set }: { config: Config; set: SetFn }) {
  const entries = Object.entries(config.shortcuts);
  const setEntry = (i: number, keys: string, target: string) => {
    const next = entries.slice();
    next[i] = [keys, target];
    set('shortcuts', Object.fromEntries(next));
  };
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
              const next = { ...config.shortcuts };
              delete next[keys];
              set('shortcuts', next);
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
  );
}

function AboutTab() {
  const [version, setVersion] = useState('');
  useEffect(() => {
    getVersion().then(setVersion).catch(console.error);
  }, []);
  return (
    <div className="about">
      <img className="appicon" src={iconUrl} alt="launcharr icon" />
      <p className="wordmark">
        <span className="sigil">❯</span> launcharr
        {version ? ` v${version}` : ''}
      </p>
      <p className="hint">An app launcher for pirates.</p>
    </div>
  );
}
