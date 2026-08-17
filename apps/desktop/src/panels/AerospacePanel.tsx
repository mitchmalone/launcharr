/**
 * AeroSpace panel, presentational half (`aerospace ⏎`, fuzzy `aero`). The tray
 * menu as launcher rows — workspaces (Enter focuses), pause/resume tiling,
 * reload config, open config, sponsor — so the menu bar item is redundant.
 * Pure props + @launcharr/tui; the container owns invokes.
 */
import {
  KeyHints,
  ListRow,
  Panel,
  SectionHeader,
  SegmentedControl,
  useListNav,
} from '@launcharr/tui'
import { LayoutGrid } from 'lucide-react'
import { useState } from 'react'

/** Mirrors `AerospaceWorkspace` in desktop.rs. */
export interface AerospaceWorkspace {
  name: string
  focused: boolean
  empty: boolean
}

/** Mirrors `AerospaceAction` in desktop.rs. */
export type AerospaceAction =
  | { kind: 'workspace'; name: string }
  | { kind: 'toggle' }
  | { kind: 'reloadConfig' }
  | { kind: 'openConfig' }
  | { kind: 'sponsor' }

const ACTIONS: { action: AerospaceAction; label: string; sub: string }[] = [
  {
    action: { kind: 'toggle' },
    label: 'Pause / resume tiling',
    sub: 'aerospace enable toggle',
  },
  {
    action: { kind: 'reloadConfig' },
    label: 'Reload config',
    sub: 'aerospace reload-config',
  },
  {
    action: { kind: 'openConfig' },
    label: 'Open config',
    sub: 'launcharr’s config.json when managed, else aerospace.toml',
  },
  {
    action: { kind: 'sponsor' },
    label: 'Sponsor AeroSpace on GitHub',
    sub: 'the tiling is nikitabobko’s work',
  },
]

export function AerospacePanel({
  workspaces,
  installed,
  onAction,
  onClose,
}: {
  workspaces: AerospaceWorkspace[] | null
  installed: boolean
  onAction: (action: AerospaceAction) => void
  onClose: () => void
}) {
  const ws = workspaces ?? []
  const focused = ws.find((w) => w.focused)
  // Row 0 is the horizontal workspace strip (←→ moves a cursor inside it,
  // Enter focuses the cursor's workspace); rows 1.. are the actions.
  const hasStrip = ws.length > 0
  const count = (hasStrip ? 1 : 0) + ACTIONS.length
  const [cursor, setCursor] = useState<string | null>(null)
  const cursorName =
    cursor && ws.some((w) => w.name === cursor)
      ? cursor
      : (focused?.name ?? ws[0]?.name ?? null)
  const activate = (index: number) => {
    if (hasStrip && index === 0) {
      if (cursorName) onAction({ kind: 'workspace', name: cursorName })
      return
    }
    const a = ACTIONS[index - (hasStrip ? 1 : 0)]
    if (a) onAction(a.action)
  }
  const nav = useListNav(count, { onActivate: activate, onBack: onClose })
  const stepCursor = (delta: number) => {
    if (!cursorName) return
    const i = ws.findIndex((w) => w.name === cursorName)
    const next = ws[(i + delta + ws.length) % ws.length]
    if (next) setCursor(next.name)
  }

  return (
    <Panel
      autoFocus
      icon={<LayoutGrid size={17} strokeWidth={2} aria-hidden />}
      title="AeroSpace"
      subtitle={
        !installed
          ? 'not installed — Settings → Desktop'
          : workspaces === null
            ? 'loading…'
            : focused
              ? `workspace ${focused.name}`
              : 'tiling paused'
      }
      onKeyDown={(e) => {
        // Digits jump straight to that workspace, like the global keys.
        if (/^[1-9]$/.test(e.key) && ws.some((w) => w.name === e.key)) {
          e.preventDefault()
          onAction({ kind: 'workspace', name: e.key })
          return
        }
        if (
          hasStrip &&
          nav.index === 0 &&
          (e.key === 'ArrowLeft' || e.key === 'ArrowRight')
        ) {
          e.preventDefault()
          stepCursor(e.key === 'ArrowLeft' ? -1 : 1)
          return
        }
        nav.onKeyDown(e)
      }}
      footer={
        <KeyHints
          hints={[
            { keys: '↑↓', label: 'move' },
            { keys: '←→', label: 'workspace' },
            { keys: '⏎', label: 'run' },
            { keys: '1-9', label: 'jump' },
            { keys: 'esc', label: 'back' },
          ]}
        />
      }
    >
      {hasStrip && (
        <>
          <SectionHeader label="Workspaces" />
          <SegmentedControl
            options={ws.map((w) => ({
              value: w.name,
              label: w.name,
              dim: w.empty && !w.focused,
            }))}
            value={focused?.name ?? ''}
            cursor={nav.index === 0 ? (cursorName ?? undefined) : undefined}
            onChange={(name) => onAction({ kind: 'workspace', name })}
            onHover={(name) => {
              nav.setIndex(0)
              setCursor(name)
            }}
          />
        </>
      )}
      <SectionHeader label="Actions" />
      {ACTIONS.map((a, j) => {
        const i = (hasStrip ? 1 : 0) + j
        return (
          <ListRow
            key={a.action.kind}
            label={a.label}
            sub={a.sub}
            selected={i === nav.index}
            onClick={() => activate(i)}
            onHover={() => nav.setIndex(i)}
          />
        )
      })}
    </Panel>
  )
}
