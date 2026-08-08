import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

import { parseInput } from './lib/grammar';
import { markInput, reportResultsPainted } from './lib/perf';
import {
  clipRows,
  draftRows,
  emojiRows,
  launchRows,
  quicklinkRows,
  scriptRows,
  type QuicklinkDraft,
  type Row,
  type RowEnter,
} from './lib/rows';
import type {
  Clip,
  Config,
  FrecencyMap,
  IndexItem,
  ScriptInfo,
  ScriptItem,
} from './lib/types';

/** Keep in sync with the CSS: input row + result rows + container border. */
const INPUT_HEIGHT = 54;
const ROW_HEIGHT = 40;
const BORDER = 2;
const SCRIPT_DEBOUNCE_MS = 120;

const KNOWN_BROWSERS = [
  'Safari',
  'Google Chrome',
  'Arc',
  'Firefox',
  'Brave Browser',
  'Microsoft Edge',
  'Vivaldi',
  'Opera',
  'Orion',
  'Zen Browser',
];

const DEFAULT_CONFIG: Config = {
  hotkey: 'Alt+Space',
  terminal: 'iTerm2',
  bangNewWindow: true,
  sigil: '❯',
  bangSigil: '$',
  launchAtLogin: true,
  links: [],
  shortcuts: {},
  searchFallback: 'https://www.google.com/search?q={query}',
  indexBookmarks: false,
};

export default function App() {
  const [raw, setRaw] = useState('');
  const [selected, setSelected] = useState(0);
  const [index, setIndex] = useState<IndexItem[]>([]);
  const [frecency, setFrecency] = useState<FrecencyMap>({});
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const [scripts, setScripts] = useState<ScriptInfo[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  const [scriptItems, setScriptItems] = useState<ScriptItem[]>([]);
  const [draft, setDraft] = useState<QuicklinkDraft | null>(null);
  const [altHeld, setAltHeld] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const browsers = useMemo(
    () =>
      KNOWN_BROWSERS.filter((b) =>
        index.some((i) => i.kind === 'app' && i.name === b)
      ),
    [index]
  );

  // Trigger precedence on collision: clip (built-in) > scripts > quicklinks.
  const quicklinks = useMemo(
    () => config.links.filter((l) => l.trigger && l.url.includes('{query}')),
    [config.links]
  );
  const triggers = useMemo(
    () =>
      new Set([
        'clip',
        ...scripts.map((s) => s.trigger),
        ...quicklinks.map((l) => l.trigger as string),
      ]),
    [scripts, quicklinks]
  );
  const parsed = useMemo(() => parseInput(raw, triggers), [raw, triggers]);

  const refetchIndex = useCallback(() => {
    invoke<IndexItem[]>('get_index').then(setIndex).catch(console.error);
  }, []);
  const refetchFrecency = useCallback(() => {
    invoke<FrecencyMap>('get_frecency').then(setFrecency).catch(console.error);
  }, []);
  const refetchScripts = useCallback(() => {
    invoke<ScriptInfo[]>('get_scripts').then(setScripts).catch(console.error);
  }, []);
  const refetchClips = useCallback(() => {
    invoke<Clip[]>('get_clips').then(setClips).catch(console.error);
  }, []);

  useEffect(() => {
    refetchIndex();
    refetchFrecency();
    refetchScripts();
    refetchClips();
    invoke<Config>('read_config').then(setConfig).catch(console.error);

    const unlisteners = [
      listen('panel-shown', () => {
        setRaw('');
        setSelected(0);
        setScriptItems([]);
        setDraft(null);
        refetchFrecency();
        refetchClips();
        inputRef.current?.focus();
      }),
      listen('index-updated', refetchIndex),
      listen('icons-updated', refetchIndex),
      listen('scripts-updated', refetchScripts),
      listen<Config>('config-changed', (e) => setConfig(e.payload)),
    ];
    return () => {
      for (const p of unlisteners) p.then((un) => un());
    };
  }, [refetchIndex, refetchFrecency, refetchScripts, refetchClips]);

  // Script mode queries the script on a debounce; stale rows stay up meanwhile.
  const isScript = useCallback(
    (t: string) => t !== 'clip' && scripts.some((s) => s.trigger === t),
    [scripts]
  );
  const scriptTrigger = parsed.mode === 'trigger' && isScript(parsed.trigger);
  const trigger = parsed.mode === 'trigger' ? parsed.trigger : '';
  const args = parsed.mode === 'trigger' ? parsed.args : '';
  useEffect(() => {
    if (!scriptTrigger) {
      setScriptItems([]);
      return;
    }
    const timer = setTimeout(() => {
      invoke<ScriptItem[]>('run_script', { trigger, args })
        .then(setScriptItems)
        .catch((err) => {
          console.error(err);
          setScriptItems([]);
        });
    }, SCRIPT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [scriptTrigger, trigger, args]);

  const rows: Row[] = useMemo(() => {
    if (draft) return draftRows(draft, raw, browsers);
    switch (parsed.mode) {
      case 'launch':
        return launchRows(parsed.query, index, frecency, config.searchFallback);
      case 'trigger': {
        if (parsed.trigger === 'clip') return clipRows(parsed.args, clips);
        if (isScript(parsed.trigger)) return scriptRows(scriptItems);
        const link = quicklinks.find((l) => l.trigger === parsed.trigger);
        return link ? quicklinkRows(link, parsed.args) : [];
      }
      case 'emoji':
        return emojiRows(parsed.query);
      case 'bang':
        return [];
    }
  }, [
    parsed,
    index,
    frecency,
    clips,
    scriptItems,
    config.searchFallback,
    quicklinks,
    isScript,
    draft,
    raw,
    browsers,
  ]);

  const rowCount =
    parsed.mode === 'bang' ? 1 : rows.length > 0 ? rows.length : raw ? 1 : 0;
  useEffect(() => {
    const height = INPUT_HEIGHT + rowCount * ROW_HEIGHT + BORDER;
    invoke('resize_panel', { height }).catch(console.error);
  }, [rowCount]);

  // Runs after the commit that rendered the new results — the §7 keystroke budget.
  useEffect(() => {
    reportResultsPainted(rows.length);
  }, [rows]);

  const clampedSelection = Math.min(selected, Math.max(rows.length - 1, 0));

  const enterRow = useCallback(
    (enter: RowEnter) => {
      switch (enter.kind) {
        case 'execute': {
          const query = parsed.mode === 'launch' ? parsed.query : '';
          invoke('execute', { id: enter.id, query }).catch(console.error);
          break;
        }
        case 'copy':
          invoke('copy_text', { text: enter.text }).catch(console.error);
          break;
        case 'open-url':
          invoke('open_url', { url: enter.url }).catch(console.error);
          break;
        case 'script-action': {
          const item = scriptItems[enter.index];
          if (item) {
            invoke('script_action', { action: item.action }).catch(
              console.error
            );
          }
          break;
        }
        case 'copy-clip':
          invoke('copy_clip', { content: enter.content }).catch(console.error);
          break;
        case 'clear-clips':
          invoke('clear_clips').then(refetchClips).catch(console.error);
          break;
        case 'add-quicklink':
          setDraft({ url: enter.url, name: '', step: 'name' });
          setRaw('');
          setSelected(0);
          break;
        case 'draft-commit-name':
          if (draft && raw.trim()) {
            setDraft({ ...draft, name: raw.trim(), step: 'browser' });
            setRaw('');
            setSelected(0);
          }
          break;
        case 'pick-browser':
          if (draft) {
            invoke('add_quicklink', {
              name: draft.name,
              url: draft.url,
              browser: enter.browser,
            }).catch(console.error);
            setDraft(null);
          }
          break;
        case 'reveal':
          invoke('reveal_item', { path: enter.path }).catch(console.error);
          break;
        case 'delete-clip':
          // Deleting keeps the panel open — you're grooming the list.
          invoke('delete_clip', { id: enter.id })
            .then(refetchClips)
            .catch(console.error);
          break;
        case 'script-alt-action': {
          const alt = scriptItems[enter.index]?.altAction;
          if (alt) {
            invoke('script_action', { action: alt }).catch(console.error);
          }
          break;
        }
      }
    },
    [parsed, scriptItems, refetchClips, draft, raw]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Alt') setAltHeld(true);
      const move = (delta: number) => {
        e.preventDefault();
        if (rows.length > 0) {
          setSelected((s) => (s + delta + rows.length) % rows.length);
        }
      };

      if (e.key === 'Escape') {
        e.preventDefault();
        // In the quicklink form, Esc backs out to the launcher; a second Esc dismisses.
        if (draft) {
          setDraft(null);
          setRaw('');
          setSelected(0);
        } else {
          invoke('hide_panel').catch(console.error);
        }
        return;
      }
      if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) return move(1);
      if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) return move(-1);

      if (e.metaKey && e.key >= '1' && e.key <= '8') {
        e.preventDefault();
        const row = rows[Number(e.key) - 1];
        if (row) enterRow(row.enter);
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        if (parsed.mode === 'bang') {
          invoke('run_bang', { command: parsed.command }).catch(console.error);
        } else {
          const row = rows[clampedSelection];
          if (!row) return;
          if (e.altKey && row.alt) {
            enterRow(row.alt.enter);
          } else {
            enterRow(row.enter);
          }
        }
      }
    },
    [rows, parsed, clampedSelection, enterRow, draft]
  );

  const sigil = draft
    ? '+'
    : parsed.mode === 'bang'
      ? config.bangSigil
      : config.sigil;
  const placeholder = draft
    ? draft.step === 'name'
      ? 'name this quicklink…'
      : 'choose a browser (↑↓ then ⏎)'
    : `${config.hotkey.toLowerCase().replace('+', ' ')} to summon · ! to run in terminal`;

  return (
    <div className={`panel ${parsed.mode}`}>
      <div className="input-row">
        <span className="sigil">{sigil}</span>
        <input
          ref={inputRef}
          className="prompt"
          type="text"
          value={raw}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          autoComplete="off"
          autoFocus
          placeholder={placeholder}
          onChange={(e) => {
            markInput();
            setRaw(e.target.value);
            setSelected(0);
          }}
          onKeyDown={onKeyDown}
          onKeyUp={(e) => {
            if (e.key === 'Alt') setAltHeld(false);
          }}
          onBlur={() => setAltHeld(false)}
        />
      </div>

      {parsed.mode === 'bang' ? (
        <div className="row bang-row">
          <span className="bang-action">run in {config.terminal} ▸</span>
          <span className="bang-command">{parsed.command || 'new window'}</span>
        </div>
      ) : rows.length > 0 ? (
        <ul className="results">
          {rows.map((row, i) => (
            <li
              key={row.key}
              className={`row result ${i === clampedSelection ? 'selected' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                enterRow(e.altKey && row.alt ? row.alt.enter : row.enter);
              }}
            >
              {row.icon ? (
                <img className="icon" src={convertFileSrc(row.icon)} alt="" />
              ) : (
                <span className="icon glyph">{row.glyph}</span>
              )}
              <span className="name">
                {row.title.split('').map((ch, j) => (
                  <span
                    key={j}
                    className={row.positions.includes(j) ? 'hit' : ''}
                  >
                    {ch}
                  </span>
                ))}
              </span>
              <span className="hint">
                {i < 8 ? <kbd>⌘{i + 1}</kbd> : null}
                {altHeld && row.alt ? `⌥⏎ ${row.alt.label}` : row.hint}
              </span>
            </li>
          ))}
        </ul>
      ) : raw ? (
        <div className="row empty">nothing on the horizon</div>
      ) : null}
    </div>
  );
}
