import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

import type { Config, Link } from '../lib/types';

/**
 * The settings window: a form over config.json, nothing more. Saving writes the file; the
 * config watcher hot-applies everything (hotkey, shortcuts, login item, links, bookmarks).
 * The file stays the source of truth — hand-edits keep working.
 */

export default function SettingsApp() {
  const [config, setConfig] = useState<Config | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<Config>('read_config').then(setConfig).catch(console.error);
    const un = listen<Config>('config-changed', (e) => setConfig(e.payload));
    return () => {
      un.then((u) => u());
    };
  }, []);

  const save = useCallback(() => {
    if (!config) return;
    invoke('write_config', { config })
      .then(() => {
        setError(null);
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 1500);
      })
      .catch((e) => setError(String(e)));
  }, [config]);

  if (!config) return <div className="settings">loading…</div>;

  const set = <K extends keyof Config>(key: K, value: Config[K]) =>
    setConfig({ ...config, [key]: value });

  const setLink = (i: number, patch: Partial<Link>) => {
    const links = config.links.slice();
    links[i] = { ...links[i], ...patch };
    set('links', links);
  };

  const shortcutEntries = Object.entries(config.shortcuts);

  return (
    <div className="settings">
      <h1>
        <span className="sigil">❯</span> launcharr settings
      </h1>
      <p className="pathline">
        Everything here lives in <code>~/.config/launcharr/config.json</code> —
        edit either place, changes apply live.
      </p>

      <section>
        <h2>General</h2>
        <label>
          Summon hotkey
          <input
            value={config.hotkey}
            onChange={(e) => set('hotkey', e.target.value)}
            placeholder="Alt+Space"
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={config.launchAtLogin}
            onChange={(e) => set('launchAtLogin', e.target.checked)}
          />
          Launch at login
        </label>
        <div className="row2">
          <label>
            Prompt sigil
            <input
              value={config.sigil}
              onChange={(e) => set('sigil', e.target.value)}
            />
          </label>
          <label>
            Bang sigil
            <input
              value={config.bangSigil}
              onChange={(e) => set('bangSigil', e.target.value)}
            />
          </label>
        </div>
      </section>

      <section>
        <h2>Bang mode</h2>
        <div className="row2">
          <label>
            Terminal
            <select
              value={config.terminal}
              onChange={(e) =>
                set('terminal', e.target.value as Config['terminal'])
              }
            >
              <option value="iTerm2">iTerm2</option>
              <option value="Terminal">Terminal.app</option>
            </select>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={config.bangNewWindow}
              onChange={(e) => set('bangNewWindow', e.target.checked)}
            />
            New window per command
          </label>
        </div>
      </section>

      <section>
        <h2>Search</h2>
        <label>
          Dead-end search fallback (<code>{'{query}'}</code> placeholder)
          <input
            value={config.searchFallback}
            onChange={(e) => set('searchFallback', e.target.value)}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={config.indexBookmarks}
            onChange={(e) => set('indexBookmarks', e.target.checked)}
          />
          Index browser bookmarks (Chrome-family + Safari; local reads only)
        </label>
      </section>

      <section>
        <h2>Links & quicklinks</h2>
        {config.links.map((link, i) => (
          <div className="linkrow" key={i}>
            <input
              placeholder="name"
              value={link.name}
              onChange={(e) => setLink(i, { name: e.target.value })}
            />
            <input
              className="grow"
              placeholder="https://… ({query} makes it a quicklink)"
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
      </section>

      <section>
        <h2>Global shortcuts</h2>
        {shortcutEntries.map(([keys, target], i) => (
          <div className="linkrow" key={i}>
            <input
              placeholder="Cmd+Shift+S"
              value={keys}
              onChange={(e) => {
                const entries = shortcutEntries.slice();
                entries[i] = [e.target.value, target];
                set('shortcuts', Object.fromEntries(entries));
              }}
            />
            <input
              className="grow"
              placeholder="item name, e.g. Safari"
              value={target}
              onChange={(e) => {
                const entries = shortcutEntries.slice();
                entries[i] = [keys, e.target.value];
                set('shortcuts', Object.fromEntries(entries));
              }}
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
      </section>

      <footer>
        {error ? <span className="error">{error}</span> : null}
        <button className="save" onClick={save}>
          {savedFlash ? 'saved ✓' : 'save'}
        </button>
      </footer>
    </div>
  );
}
