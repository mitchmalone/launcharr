import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

import { parseInput } from './lib/grammar';
import { markInput, reportResultsPainted } from './lib/perf';
import { clipRows, launchRows, scriptRows, type Row } from './lib/rows';
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

const DEFAULT_CONFIG: Config = {
  hotkey: 'Alt+Space',
  terminal: 'iTerm2',
  bangNewWindow: true,
  sigil: '❯',
  bangSigil: '$',
  launchAtLogin: true,
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
  const inputRef = useRef<HTMLInputElement>(null);

  const triggers = useMemo(
    () => new Set(['clip', ...scripts.map((s) => s.trigger)]),
    [scripts]
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
  const scriptTrigger = parsed.mode === 'trigger' && parsed.trigger !== 'clip';
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
    switch (parsed.mode) {
      case 'launch':
        return launchRows(parsed.query, index, frecency);
      case 'trigger':
        return parsed.trigger === 'clip'
          ? clipRows(parsed.args, clips)
          : scriptRows(scriptItems);
      case 'bang':
        return [];
    }
  }, [parsed, index, frecency, clips, scriptItems]);

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
    (row: Row) => {
      switch (row.enter.kind) {
        case 'execute': {
          const query = parsed.mode === 'launch' ? parsed.query : '';
          invoke('execute', { id: row.enter.id, query }).catch(console.error);
          break;
        }
        case 'copy':
          invoke('copy_text', { text: row.enter.text }).catch(console.error);
          break;
        case 'script-action': {
          const item = scriptItems[row.enter.index];
          if (item) {
            invoke('script_action', { action: item.action }).catch(
              console.error
            );
          }
          break;
        }
        case 'copy-clip':
          invoke('copy_clip', { content: row.enter.content }).catch(
            console.error
          );
          break;
        case 'clear-clips':
          invoke('clear_clips').then(refetchClips).catch(console.error);
          break;
      }
    },
    [parsed, scriptItems, refetchClips]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      const move = (delta: number) => {
        e.preventDefault();
        if (rows.length > 0) {
          setSelected((s) => (s + delta + rows.length) % rows.length);
        }
      };

      if (e.key === 'Escape') {
        e.preventDefault();
        invoke('hide_panel').catch(console.error);
        return;
      }
      if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) return move(1);
      if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) return move(-1);

      if (e.metaKey && e.key >= '1' && e.key <= '8') {
        e.preventDefault();
        const row = rows[Number(e.key) - 1];
        if (row) enterRow(row);
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        if (parsed.mode === 'bang') {
          invoke('run_bang', { command: parsed.command }).catch(console.error);
        } else {
          const row = rows[clampedSelection];
          if (row) enterRow(row);
        }
      }
    },
    [rows, parsed, clampedSelection, enterRow]
  );

  const sigil = parsed.mode === 'bang' ? config.bangSigil : config.sigil;

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
          placeholder={`${config.hotkey.toLowerCase().replace('+', ' ')} to summon · ! to run in terminal`}
          onChange={(e) => {
            markInput();
            setRaw(e.target.value);
            setSelected(0);
          }}
          onKeyDown={onKeyDown}
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
                enterRow(row);
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
                {row.hint}
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
