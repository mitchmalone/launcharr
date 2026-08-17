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
  useListNav,
} from '@launcharr/tui'
import { LayoutGrid } from 'lucide-react'

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
  const count = ws.length + ACTIONS.length
  const activate = (index: number) => {
    if (index < ws.length) {
      const w = ws[index]
      if (w) onAction({ kind: 'workspace', name: w.name })
      return
    }
    const a = ACTIONS[index - ws.length]
    if (a) onAction(a.action)
  }
  const nav = useListNav(count, { onActivate: activate, onBack: onClose })
  const focused = ws.find((w) => w.focused)

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
        nav.onKeyDown(e)
      }}
      footer={
        <KeyHints
          hints={[
            { keys: '↑↓', label: 'move' },
            { keys: '⏎', label: 'run' },
            { keys: '1-9', label: 'workspace' },
            { keys: 'esc', label: 'back' },
          ]}
        />
      }
    >
      {ws.length > 0 && <SectionHeader label="Workspaces" />}
      {ws.map((w, i) => (
        <ListRow
          key={`ws-${w.name}`}
          label={w.name}
          dim={w.empty && !w.focused}
          right={w.focused ? '● focused' : w.empty ? 'empty' : ''}
          selected={i === nav.index}
          onClick={() => activate(i)}
          onHover={() => nav.setIndex(i)}
        />
      ))}
      <SectionHeader label="Actions" />
      {ACTIONS.map((a, j) => {
        const i = ws.length + j
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
