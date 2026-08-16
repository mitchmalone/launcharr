'use client'

import { parseInput } from '@launcharr/core/grammar'
import { BUILTIN_THEMES, themeNames } from '@launcharr/tui'
import { useEffect, useRef, useState } from 'react'

import { type PanelId, askAnswer } from '@/lib/demo-data'
import { type DemoRow, computeDemoRows } from '@/lib/demo-rows'
import { SEED_FRECENCY, TRIGGERS } from '@/lib/launch-index'

import { DemoBar } from './bar'
import { DnsPanel, StubPanel, UsagePanel, WifiPanel } from './panels'

const TERMINAL = 'iTerm2'
const SIGIL = '❯'
const BANG_SIGIL = '$'
const TOAST_MS = 2600
const SAMPLES = [
  'gho',
  'ps',
  'displays',
  '!git status',
  'wifi',
  'usage',
  '? what are quicklinks',
  'gh tauri',
]

type Ask = { prompt: string; text: string; done: boolean }

/**
 * The interactive demo: a mock desktop with the bar across the top and the
 * launcher panel hanging Spotlight-style below it.
 *
 * Everything the panel decides — grammar, fuzzy matching, ranking, row shapes —
 * runs in `@launcharr/core`, and the TUI panels are the real `@launcharr/tui`
 * components. The website supplies a fake index and fake OS data; it never
 * forks engine logic (invariant 5).
 */
export function Demo() {
  const [raw, setRaw] = useState('')
  const [selected, setSelected] = useState(0)
  const [frecency, setFrecency] =
    useState<Record<string, number>>(SEED_FRECENCY)
  const [toast, setToast] = useState('')
  const [themeName, setThemeName] = useState('launcharr')
  const [panel, setPanel] = useState<PanelId | null>(null)
  const [ask, setAsk] = useState<Ask | null>(null)
  const [workspace, setWorkspace] = useState('2')

  const inputRef = useRef<HTMLInputElement | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  )
  const stream = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  useEffect(
    () => () => {
      clearTimeout(toastTimer.current)
      clearInterval(stream.current)
    },
    [],
  )

  const theme = BUILTIN_THEMES[themeName] ?? BUILTIN_THEMES.launcharr!

  const showToast = (message: string) => {
    setToast(message)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), TOAST_MS)
  }

  const parsed = parseInput(raw, TRIGGERS)
  const isBang = parsed.mode === 'bang'
  const isAskMode = parsed.mode === 'ask'
  const rows = computeDemoRows(raw, frecency)
  const sel = Math.min(selected, Math.max(rows.length - 1, 0))

  const closePanel = () => {
    setPanel(null)
    setRaw('')
    setSelected(0)
    inputRef.current?.focus()
  }

  /** Types the canned answer out a few characters a frame, like a streamed reply. */
  const startAsk = (prompt: string) => {
    const text = askAnswer(prompt)
    clearInterval(stream.current)
    setAsk({ prompt, text: '', done: false })
    let i = 0
    stream.current = setInterval(() => {
      i += 3
      const done = i >= text.length
      setAsk({ prompt, text: text.slice(0, i), done })
      if (done) clearInterval(stream.current)
    }, 16)
  }

  const fire = (row: DemoRow | undefined) => {
    if (!row) return
    if (row.openPanel) {
      setPanel(row.openPanel as PanelId)
      setRaw('')
      setSelected(0)
      setToast('')
      return
    }
    if (row.id) setFrecency((f) => ({ ...f, [row.id!]: (f[row.id!] ?? 0) + 1 }))
    showToast('⏎ ' + row.action + '  ·  panel dismissed, focus returned')
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const move = (d: number) => {
      e.preventDefault()
      if (rows.length > 0) {
        setSelected(
          (Math.min(selected, rows.length - 1) + d + rows.length) % rows.length,
        )
      }
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      if (ask) {
        clearInterval(stream.current)
        setAsk(null)
      }
      setRaw('')
      setSelected(0)
      setToast('')
      return
    }
    if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) return move(1)
    if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) return move(-1)
    if (e.metaKey && e.key >= '1' && e.key <= '8') {
      e.preventDefault()
      fire(rows[Number(e.key) - 1])
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (isBang) {
        showToast(
          '⏎ sent to ' + TERMINAL + ' ▸ ' + (parsed.command || 'new window'),
        )
      } else if (isAskMode) {
        if (parsed.prompt.trim()) startAsk(parsed.prompt.trim())
      } else {
        fire(rows[sel])
      }
    }
  }

  /* The kit resolves its chrome through --tui-*; without explicit values it
     would inherit the *page* tokens of the same name. --d-* drive the mock bar. */
  const scopeVars = {
    '--tui-bg': theme.glass,
    '--tui-surface': theme.surface,
    '--tui-border': theme.border,
    '--tui-frame': theme.border,
    '--tui-fg': theme.fg,
    '--tui-dim': theme.dim,
    '--tui-accent': theme.accent,
    '--tui-selected': theme.selected,
    '--d-glass': theme.glass,
    '--d-border': theme.border,
    '--d-fg': theme.fg,
    '--d-dim': theme.dim,
    '--d-sigil': theme.sigil,
  } as React.CSSProperties

  const panelBody = () => {
    if (panel === 'wifi')
      return <WifiPanel onClose={closePanel} onToast={showToast} />
    if (panel === 'dns') return <DnsPanel onClose={closePanel} />
    if (panel === 'usage') return <UsagePanel onClose={closePanel} />
    if (panel) return <StubPanel id={panel} onClose={closePanel} />
    return null
  }

  return (
    <div style={scopeVars}>
      <div
        onClick={() => !panel && inputRef.current?.focus()}
        className="relative h-[620px] overflow-hidden rounded-[14px] border border-(--hair)"
        style={{
          background:
            'radial-gradient(120% 90% at 75% 10%, #3d2350 0%, #26203f 42%, #1c1d2d 75%, #14151f 100%)',
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(55% 40% at 20% 85%, rgba(255,107,140,0.22) 0%, transparent 70%)',
          }}
        />

        <DemoBar workspace={workspace} onWorkspace={setWorkspace} />

        {/* above the aurora wash, below the bar (z-10) so hover cards win */}
        <div className="relative z-[5] flex h-full items-start justify-center px-8 pt-[150px]">
          <div className="w-full max-w-[620px]">
            {panel ? (
              <div
                className="overflow-hidden rounded-[10px]"
                style={{ boxShadow: 'var(--shadow)' }}
              >
                {panelBody()}
              </div>
            ) : (
              <div
                className="overflow-hidden rounded-[10px] border font-mono"
                style={{
                  boxShadow: 'var(--shadow)',
                  background: theme.glass,
                  borderColor: theme.border,
                  color: theme.fg,
                }}
              >
                <div className="flex h-[54px] shrink-0 items-center gap-2.5 px-3.5">
                  <span
                    className="text-[17px] font-semibold"
                    style={{
                      color: isBang
                        ? theme.bang
                        : isAskMode
                          ? theme.accent
                          : theme.sigil,
                    }}
                  >
                    {isBang ? BANG_SIGIL : isAskMode ? '?' : SIGIL}
                  </span>
                  <input
                    type="text"
                    value={raw}
                    ref={inputRef}
                    spellCheck={false}
                    autoComplete="off"
                    aria-label="launcharr demo prompt"
                    placeholder="Search for apps and commands…"
                    onChange={(e) => {
                      setRaw(e.target.value)
                      setSelected(0)
                      setToast('')
                      if (ask) setAsk(null)
                    }}
                    onKeyDown={onKeyDown}
                    className="flex-1 border-none bg-transparent text-base outline-none"
                    style={{
                      color: theme.fg,
                      caretColor: isBang ? theme.bang : theme.sigil,
                    }}
                  />
                </div>

                {isBang && (
                  <div className="flex h-10 items-center gap-2.5 px-3.5 text-sm">
                    <span
                      className="whitespace-nowrap"
                      style={{ color: theme.bang }}
                    >
                      run in {TERMINAL} ▸
                    </span>
                    <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                      {parsed.command || 'new window'}
                    </span>
                  </div>
                )}

                {ask && (
                  <div className="h-[320px] overflow-y-auto px-4 pb-3.5 pt-2.5">
                    <div
                      className="mb-2 text-[13px]"
                      style={{ color: theme.dim }}
                    >
                      ❯ {ask.prompt}
                    </div>
                    <p
                      className="m-0 whitespace-pre-wrap break-words text-[13px] leading-[1.55]"
                      style={{ color: theme.fg }}
                    >
                      {ask.text}
                      {!ask.done && (
                        <span style={{ color: theme.accent }}>▊</span>
                      )}
                    </p>
                  </div>
                )}

                {isAskMode && !ask && (
                  <div
                    className="flex h-10 items-center px-3.5 text-sm italic"
                    style={{ color: theme.dim }}
                  >
                    ⏎ to ask — answers stream from your own claude or codex CLI
                  </div>
                )}

                {!isBang && !isAskMode && rows.length > 0 && (
                  <ul className="list-none">
                    {rows.map((row, i) => (
                      <li
                        key={row.key}
                        onMouseEnter={() => setSelected(i)}
                        onMouseDown={(e) => {
                          e.preventDefault()
                          fire(row)
                        }}
                        className="flex h-10 items-center gap-2.5 px-3.5 text-sm"
                        style={{
                          background:
                            i === sel ? theme.selected : 'transparent',
                        }}
                      >
                        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-[15px]">
                          {row.glyph}
                        </span>
                        <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                          {row.title.split('').map((ch, j) => (
                            <span
                              key={j}
                              style={{
                                color: row.positions.includes(j)
                                  ? theme.accent
                                  : theme.fg,
                                fontWeight: row.positions.includes(j)
                                  ? 700
                                  : 400,
                              }}
                            >
                              {ch}
                            </span>
                          ))}
                        </span>
                        <span
                          className="inline-flex items-center gap-2 text-xs"
                          style={{ color: theme.dim }}
                        >
                          <kbd
                            style={{
                              font: 'inherit',
                              opacity: i === sel ? 0.7 : 0,
                            }}
                          >
                            {i < 8 ? '⌘' + (i + 1) : ''}
                          </kbd>
                          {row.hint}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {!isBang &&
                  !isAskMode &&
                  rows.length === 0 &&
                  raw.length > 0 && (
                    <div
                      className="flex h-10 items-center px-3.5 text-sm italic"
                      style={{ color: theme.dim }}
                    >
                      nothing on the horizon
                    </div>
                  )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* try-chips + theme picker, on the page rather than inside the desktop */}
      <div className="mt-[22px] flex flex-wrap items-center justify-between gap-x-6 gap-y-2.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-xs text-(--dim2)">try</span>
          {SAMPLES.map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                setPanel(null)
                setAsk(null)
                setRaw(label)
                setSelected(0)
                setToast('')
                inputRef.current?.focus()
              }}
              className="cursor-pointer rounded-md border border-(--border) bg-(--chip) px-[11px] py-1.5 font-mono text-[12.5px] text-(--body) hover:border-(--accent) hover:text-(--fg)"
            >
              {label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-(--dim2)">
          theme
          <select
            value={themeName}
            onChange={(e) => setThemeName(e.target.value)}
            className="cursor-pointer rounded-md border border-(--border) bg-(--chip) px-2.5 py-1.5 font-mono text-[12.5px] text-(--body) outline-none hover:border-(--accent)"
          >
            {themeNames({}).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div
        className="mt-3.5 min-h-[18px] text-[12.5px]"
        style={{ color: toast ? 'var(--green)' : 'transparent' }}
      >
        {toast}
      </div>
    </div>
  )
}
