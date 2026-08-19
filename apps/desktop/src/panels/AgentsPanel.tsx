/**
 * Agents panel, presentational half: live coding-agent sessions from the
 * monitor (agents.rs). Pure props + @launcharr/tui — the container
 * (AgentsPanelContainer) owns invokes and refresh.
 */
import { KeyHints, ListRow, Panel, useListNav } from '@launcharr/tui'
import type { KeyboardEvent } from 'react'

/** Mirrors AgentSession in agents.rs. */
export interface AgentSession {
  session: string
  agent: string
  state: string
  title: string
  detail: string
  /** Which multiplexer the agent lives in: 'tmux' | 'herdr' | '' for neither. */
  mux: string
  /** Pane id inside it: '%12' (tmux), 'w1:p1' (herdr). */
  muxTarget: string
  /** Unix seconds of the last event. */
  updatedAt: number
  muxGroup: string | null
  muxIndex: number | null
  muxLabel: string | null
  pid: number | null
  pidComm: string | null
  /** Running subagents (id, kind, description, startedAt). */
  subagents: {
    id: string
    kind: string
    description: string
    startedAt: number
  }[]
}

const GLYPHS: Record<string, string> = {
  working: '●',
  attention: '◉',
  done: '●',
  idle: '○',
}

export function agentGlyph(state: string): string {
  return GLYPHS[state] ?? '◌'
}

/** Compact relative age: 45s, 12m, 3h. */
export function formatAge(updatedAt: number, nowSecs: number): string {
  const s = Math.max(0, nowSecs - updatedAt)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.round(s / 60)}m`
  return `${Math.round(s / 3600)}h`
}

export interface AgentsPanelProps {
  sessions: AgentSession[]
  /** Unix seconds "now", injected so stories render deterministic ages. */
  nowSecs: number
  onJump: (session: AgentSession) => void
  /** Drop a session by hand — the escape hatch when liveness checks can't. */
  onDismiss: (session: AgentSession) => void
  onClose: () => void
}

export function AgentsPanel({
  sessions,
  nowSecs,
  onJump,
  onDismiss,
  onClose,
}: AgentsPanelProps) {
  // Same order as the bar: multiplexer group, then tab index; pane-less last.
  const ordered = [...sessions].sort(
    (a, b) =>
      (a.muxGroup ?? '￿').localeCompare(b.muxGroup ?? '￿') ||
      (a.muxIndex ?? 0) - (b.muxIndex ?? 0) ||
      a.session.localeCompare(b.session),
  )
  const nav = useListNav(ordered.length, {
    onActivate: (i) => {
      const session = ordered[i]
      if (session) onJump(session)
    },
    onBack: onClose,
  })

  // Dismiss rides on top of the shared nav rather than inside it: this is the
  // only list where a row is a claim about the world that can go stale.
  const onKeyDown = (event: KeyboardEvent) => {
    if (
      event.key === 'Backspace' ||
      event.key === 'Delete' ||
      event.key === 'x'
    ) {
      const session = ordered[nav.index]
      if (session) {
        event.preventDefault()
        onDismiss(session)
      }
      return
    }
    nav.onKeyDown(event)
  }

  const count = (state: string) =>
    sessions.filter((s) => s.state === state).length
  const subtitle =
    sessions.length === 0
      ? 'no live sessions'
      : [
          count('working') > 0 && `${count('working')} working`,
          count('attention') > 0 && `${count('attention')} blocked`,
          count('done') > 0 && `${count('done')} unread`,
          `${sessions.length} total`,
        ]
          .filter(Boolean)
          .join(' · ')

  return (
    <Panel
      autoFocus
      icon="◉"
      title="Agents"
      subtitle={subtitle}
      onKeyDown={onKeyDown}
      footer={
        <KeyHints
          hints={[
            { keys: '↑↓', label: 'move' },
            { keys: '↵', label: 'jump to pane' },
            { keys: '⌫', label: 'dismiss' },
            { keys: 'esc', label: 'back' },
          ]}
        />
      }
    >
      {sessions.length === 0 ? (
        <ListRow dim label="no live agent sessions" sub="idle for now" />
      ) : (
        <div className="tui-scroll">
          {ordered.map((s, i) => (
            <ListRow
              key={s.session}
              icon={agentGlyph(s.state)}
              label={s.title || s.session.slice(0, 8)}
              sub={[
                s.muxGroup && `${s.muxGroup}:${s.muxIndex}`,
                s.agent,
                s.state,
                s.subagents.length > 0 && `⑂ ${s.subagents.length}`,
                s.detail,
              ]
                .filter(Boolean)
                .join(' · ')}
              right={
                s.muxTarget
                  ? formatAge(s.updatedAt, nowSecs)
                  : `${formatAge(s.updatedAt, nowSecs)} · outside a multiplexer`
              }
              selected={i === nav.index}
              onClick={() => onJump(s)}
              onHover={() => nav.setIndex(i)}
            />
          ))}
        </div>
      )}
    </Panel>
  )
}
