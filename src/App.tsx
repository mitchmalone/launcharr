import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

import { parseInput } from './lib/grammar';
import { rank } from './lib/ranking';
import type { Config, FrecencyMap, IndexItem } from './lib/types';

/** Keep in sync with the CSS: input row + result rows + container border. */
const INPUT_HEIGHT = 54;
const ROW_HEIGHT = 40;
const BORDER = 2;

const DEFAULT_CONFIG: Config = {
  hotkey: 'Alt+Space',
  terminal: 'iTerm2',
  bangNewWindow: true,
  sigil: '❯',
  bangSigil: '$',
};

function kindGlyph(item: IndexItem): string {
  if (item.kind === 'settings') return '⚙';
  return '⚓︎';
}

export default function App() {
  const [raw, setRaw] = useState('');
  const [selected, setSelected] = useState(0);
  const [index, setIndex] = useState<IndexItem[]>([]);
  const [frecency, setFrecency] = useState<FrecencyMap>({});
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const inputRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => parseInput(raw), [raw]);
  const results = useMemo(
    () => (parsed.mode === 'launch' ? rank(parsed.query, index, frecency) : []),
    [parsed, index, frecency]
  );

  const refetchIndex = useCallback(() => {
    invoke<IndexItem[]>('get_index').then(setIndex).catch(console.error);
  }, []);

  const refetchFrecency = useCallback(() => {
    invoke<FrecencyMap>('get_frecency').then(setFrecency).catch(console.error);
  }, []);

  useEffect(() => {
    refetchIndex();
    refetchFrecency();
    invoke<Config>('read_config').then(setConfig).catch(console.error);

    const unlisteners = [
      listen('panel-shown', () => {
        setRaw('');
        setSelected(0);
        refetchFrecency();
        inputRef.current?.focus();
      }),
      listen('index-updated', refetchIndex),
      listen('icons-updated', refetchIndex),
      listen<Config>('config-changed', (e) => setConfig(e.payload)),
    ];
    return () => {
      for (const p of unlisteners) p.then((un) => un());
    };
  }, [refetchIndex, refetchFrecency]);

  // The panel grows downward to fit results; the window is resized natively.
  const rows =
    parsed.mode === 'bang'
      ? 1
      : raw && results.length === 0
        ? 1
        : results.length;
  useEffect(() => {
    const height = INPUT_HEIGHT + rows * ROW_HEIGHT + BORDER;
    invoke('resize_panel', { height }).catch(console.error);
  }, [rows]);

  const clampedSelection = Math.min(selected, Math.max(results.length - 1, 0));

  const execute = useCallback(
    (item: IndexItem) => {
      const query = parsed.mode === 'launch' ? parsed.query : '';
      invoke('execute', { id: item.id, query }).catch(console.error);
    },
    [parsed]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      const move = (delta: number) => {
        e.preventDefault();
        if (results.length > 0) {
          setSelected((s) => (s + delta + results.length) % results.length);
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
        const item = results[Number(e.key) - 1]?.item;
        if (item) execute(item);
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        if (parsed.mode === 'bang') {
          invoke('run_bang', { command: parsed.command }).catch(console.error);
        } else {
          const item = results[clampedSelection]?.item;
          if (item) execute(item);
        }
      }
    },
    [results, parsed, clampedSelection, execute]
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
      ) : results.length > 0 ? (
        <ul className="results">
          {results.map(({ item, positions }, i) => (
            <li
              key={item.id}
              className={`row result ${i === clampedSelection ? 'selected' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                execute(item);
              }}
            >
              {item.icon ? (
                <img className="icon" src={convertFileSrc(item.icon)} alt="" />
              ) : (
                <span className="icon glyph">{kindGlyph(item)}</span>
              )}
              <span className="name">
                {item.name.split('').map((ch, j) => (
                  <span key={j} className={positions.includes(j) ? 'hit' : ''}>
                    {ch}
                  </span>
                ))}
              </span>
              <span className="hint">
                {i < 8 ? <kbd>⌘{i + 1}</kbd> : null}
                {item.hint}
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
