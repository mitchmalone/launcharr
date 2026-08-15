/**
 * Agents panel, presentational half: live coding-agent sessions from the
 * monitor (agents.rs). Pure props + @launcharr/tui — the container
 * (AgentsPanelContainer) owns invokes and refresh.
 */
import { KeyHints, ListRow, Panel, useListNav } from '@launcharr/tui'

/** Mirrors AgentSession in agents.rs. */
export interface AgentSession {
  session: string
  agent: string
  state: string
  title: string
  detail: string
  tmux: string
  /** Unix seconds of the last event. */
  updatedAt: number
}

const GLYPHS: Record<string, string> = {
  working: '●',
  attention: '◉',
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
  onClose: () => void
}

export function AgentsPanel({
  sessions,
  nowSecs,
  onJump,
  onClose,
}: AgentsPanelProps) {
  const nav = useListNav(sessions.length, {
    onActivate: (i) => {
      const session = sessions[i]
      if (session) onJump(session)
    },
    onBack: onClose,
  })

  const working = sessions.filter((s) => s.state === 'working').length
  const attention = sessions.filter((s) => s.state === 'attention').length
  const subtitle =
    sessions.length === 0
      ? 'no live sessions'
      : [
          working > 0 && `${working} working`,
          attention > 0 && `${attention} need you`,
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
      onKeyDown={nav.onKeyDown}
      footer={
        <KeyHints
          hints={[
            { keys: '↑↓', label: 'move' },
            { keys: '↵', label: 'jump to pane' },
            { keys: 'esc', label: 'back' },
          ]}
        />
      }
    >
      {sessions.length === 0 ? (
        <ListRow dim label="no live agent sessions" sub="idle for now" />
      ) : (
        <div className="tui-scroll">
          {sessions.map((s, i) => (
            <ListRow
              key={s.session}
              icon={agentGlyph(s.state)}
              label={s.title || s.session.slice(0, 8)}
              sub={[s.agent, s.state, s.detail].filter(Boolean).join(' · ')}
              right={
                s.tmux
                  ? formatAge(s.updatedAt, nowSecs)
                  : `${formatAge(s.updatedAt, nowSecs)} · no pane`
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
