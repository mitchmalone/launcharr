'use client'

import { createContext, useContext, useEffect, useRef, useState } from 'react'

import {
  DEMO_THEMES,
  DEMO_THEME_NAMES,
  type DemoTheme,
} from '@/lib/demo-themes'
import { parseInput } from '@/lib/grammar'
import { SEED_FRECENCY } from '@/lib/launch-index'
import { computeRows } from '@/lib/rows'
import type { Row } from '@/lib/rows'

const TERMINAL = 'iTerm2'
const SIGIL = '❯'
const BANG_SIGIL = '$'
const SAMPLES = [
  'gho',
  'ps',
  'displays',
  '!git status',
  'gh tauri',
  'chill captain hook',
]
const TOAST_MS = 2600

/**
 * Demo state lives in a provider so the panel can sit inside the mock desktop
 * while the try-chips + toast render below it, outside the desktop frame.
 */
interface PanelState {
  raw: string
  setRaw: (v: string) => void
  selected: number
  setSelected: (v: number) => void
  frecency: Record<string, number>
  bump: (id: string) => void
  showToast: (m: string) => void
  clearToast: () => void
}

interface DemoState {
  toast: string
  setSample: (label: string) => void
  register: (input: HTMLInputElement | null) => void
  theme: DemoTheme
  themeName: string
  setThemeName: (name: string) => void
  panel: PanelState
}

const DemoContext = createContext<DemoState | null>(null)

function useDemo(): DemoState {
  const ctx = useContext(DemoContext)
  if (!ctx) throw new Error('Demo components must sit inside <DemoProvider>')
  return ctx
}

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [raw, setRaw] = useState('')
  const [selected, setSelected] = useState(0)
  const [frecency, setFrecency] =
    useState<Record<string, number>>(SEED_FRECENCY)
  const [toast, setToast] = useState('')
  const [themeName, setThemeName] = useState('launcharr')
  const inputRef = useRef<HTMLInputElement | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  )

  useEffect(() => () => clearTimeout(toastTimer.current), [])

  const showToast = (message: string) => {
    setToast(message)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), TOAST_MS)
  }

  const state: DemoState = {
    toast,
    theme: DEMO_THEMES[themeName] ?? DEMO_THEMES.launcharr!,
    themeName,
    setThemeName,
    register: (el) => {
      inputRef.current = el
    },
    setSample: (label) => {
      setRaw(label)
      setSelected(0)
      setToast('')
      inputRef.current?.focus()
    },
    panel: {
      raw,
      setRaw,
      selected,
      setSelected,
      frecency,
      bump: (id) => setFrecency((f) => ({ ...f, [id]: (f[id] ?? 0) + 1 })),
      showToast,
      clearToast: () => setToast(''),
    },
  }

  return <DemoContext.Provider value={state}>{children}</DemoContext.Provider>
}

/** The panel itself — rendered inside the mock desktop. */
export function DemoPanel() {
  const { register, panel, theme: t } = useDemo()
  const { raw, setRaw, selected, setSelected, frecency } = panel

  const parsed = parseInput(raw)
  const isBang = parsed.mode === 'bang'
  const rows = computeRows(raw, frecency)
  const sel = Math.min(selected, Math.max(rows.length - 1, 0))

  const fire = (row: Row | undefined) => {
    if (!row) return
    if (row.id) panel.bump(row.id)
    panel.showToast('⏎ ' + row.action + '  ·  panel dismissed, focus returned')
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
      setRaw('')
      setSelected(0)
      panel.clearToast()
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
      if (parsed.mode === 'bang') {
        panel.showToast(
          '⏎ sent to ' + TERMINAL + ' ▸ ' + (parsed.command || 'new window'),
        )
      } else {
        fire(rows[sel])
      }
    }
  }

  return (
    <div className="w-full max-w-[620px]">
      <div
        className="overflow-hidden rounded-[10px] border font-mono"
        style={{
          boxShadow: 'var(--shadow)',
          background: t.glass,
          borderColor: t.border,
          color: t.fg,
        }}
      >
        <div className="flex h-[54px] shrink-0 items-center gap-2.5 px-3.5">
          <span
            className="text-[17px] font-semibold"
            style={{ color: isBang ? t.bang : t.sigil }}
          >
            {isBang ? BANG_SIGIL : SIGIL}
          </span>
          <input
            type="text"
            value={raw}
            ref={register}
            spellCheck={false}
            autoComplete="off"
            placeholder="Search for apps and commands…"
            onChange={(e) => {
              setRaw(e.target.value)
              setSelected(0)
              panel.clearToast()
            }}
            onKeyDown={onKeyDown}
            className="flex-1 border-none bg-transparent text-base outline-none"
            style={{ color: t.fg, caretColor: isBang ? t.bang : t.sigil }}
          />
        </div>

        {parsed.mode === 'bang' && (
          <div className="flex h-10 items-center gap-2.5 px-3.5 text-sm">
            <span className="whitespace-nowrap" style={{ color: t.bang }}>
              run in {TERMINAL} ▸
            </span>
            <span className="overflow-hidden text-ellipsis whitespace-nowrap">
              {parsed.command || 'new window'}
            </span>
          </div>
        )}

        {!isBang && rows.length > 0 && (
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
                  background: i === sel ? t.selected : 'transparent',
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
                        color: row.positions.includes(j) ? t.accent : t.fg,
                        fontWeight: row.positions.includes(j) ? 700 : 400,
                      }}
                    >
                      {ch}
                    </span>
                  ))}
                </span>
                <span
                  className="inline-flex items-center gap-2 text-xs"
                  style={{ color: t.dim }}
                >
                  <kbd
                    style={{ font: 'inherit', opacity: i === sel ? 0.7 : 0 }}
                  >
                    {i < 8 ? '⌘' + (i + 1) : ''}
                  </kbd>
                  {row.hint}
                </span>
              </li>
            ))}
          </ul>
        )}

        {!isBang && rows.length === 0 && raw.length > 0 && (
          <div
            className="flex h-10 items-center px-3.5 text-sm italic"
            style={{ color: t.dim }}
          >
            nothing on the horizon
          </div>
        )}
      </div>
    </div>
  )
}

/** Try-chips + toast — rendered below the mock desktop, on the page itself. */
export function DemoChips() {
  const { setSample, toast, themeName, setThemeName } = useDemo()
  return (
    <>
      <div className="mt-[22px] flex flex-wrap items-center justify-between gap-x-6 gap-y-2.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-xs text-(--dim2)">try</span>
          {SAMPLES.map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => setSample(label)}
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
            {DEMO_THEME_NAMES.map((name) => (
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
    </>
  )
}
