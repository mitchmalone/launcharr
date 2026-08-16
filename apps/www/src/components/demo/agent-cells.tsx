'use client'

import { useEffect, useRef, useState } from 'react'

import {
  AGENT_GROUPS,
  AGENT_STATES,
  type Agent,
  agentAge,
  agentTmuxLine,
} from '@/lib/demo-data'

/**
 * The bar's agent module, ported from `AgentCluster` in
 * apps/desktop/src/bar/main.tsx and the `.bar-agent*` / `.bar-card*` rules in
 * bar/bar.css — never from a design mockup (AGENTS invariant 10).
 *
 * The bar chrome isn't in `@launcharr/tui` yet (it lives in the desktop app),
 * so this is a port rather than an import. Every value below has a counterpart
 * there; if the two drift, bar.css wins. Geometry is the real geometry — the
 * enlarged spotlight scales the whole cluster rather than inventing sizes, so
 * the paddings can't quietly diverge.
 */

/** `.bar-agent-group`: bordered box per tmux session, height 22, padding 0 5px, gap 4px. */
const GROUP_CLS =
  'flex h-[22px] items-center gap-1 border border-(--d-dim) px-[5px]'

/** `.bar-agent`: min-width 16, height/line-height 18, centered, 12px (from `.bar`). */
const CELL_STYLE: React.CSSProperties = {
  minWidth: 16,
  height: 18,
  lineHeight: '18px',
  fontSize: 12,
}

/** `CLOSE_MS` in bar/hover.ts — the grace bridging the gap between cell and card. */
const CLOSE_MS = 200

/**
 * `useBarHover`, minus the Rust cursor feed: the browser has real pointer
 * events, but the semantics it produces are the ones to copy — the card stays
 * open while the cursor is on the cell *or* the card, and closes only after
 * the grace period. Without that, moving toward the card closes it.
 */
export function useCellHover(initial: Agent | null = null) {
  const [hovered, setHovered] = useState<Agent | null>(initial)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  const stay = () => clearTimeout(timer.current)
  const enter = (a: Agent) => {
    stay()
    setHovered(a)
  }
  const leave = (to: Agent | null = null) => {
    stay()
    timer.current = setTimeout(() => setHovered(to), CLOSE_MS)
  }
  return { hovered, enter, leave, stay }
}

export function AgentCells({
  onEnter,
  onLeave,
  hovered,
}: {
  onEnter: (agent: Agent) => void
  onLeave: () => void
  /** Marks the open cell, so the cluster and its card agree. */
  hovered?: Agent | null
}) {
  return (
    <div className="flex items-center gap-1.5" onMouseLeave={onLeave}>
      {AGENT_GROUPS.map((group) => (
        <div key={group[0]!.tmuxSession} className={GROUP_CLS}>
          {group.map((a) => {
            const s = AGENT_STATES[a.state]
            return (
              <button
                key={a.session}
                type="button"
                // The app hit-tests `closest('[data-hover]')` — the whole cell.
                data-hover={`agent:${a.session}`}
                aria-label={`${a.title || a.agent} — ${s.label}`}
                aria-expanded={hovered?.session === a.session}
                onMouseEnter={() => onEnter(a)}
                onFocus={() => onEnter(a)}
                className="cursor-pointer border-none bg-transparent text-center"
                style={{
                  ...CELL_STYLE,
                  color: s.color,
                  animation:
                    a.state === 'attention'
                      ? 'bar-agent-breathe 1.6s ease-in-out infinite'
                      : undefined,
                }}
              >
                {s.glyph}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/**
 * `.bar-card.bar-agent-card` — padding 9px 12px, gap 3px, border 1px --dim,
 * background --bg. Title, then the state line carrying the glyph and relative
 * age, then detail and tmux lines in dim, then the hint at margin-top 6px.
 */
export function AgentHoverCard({
  agent,
  onMouseEnter,
  onMouseLeave,
}: {
  agent: Agent
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}) {
  const s = AGENT_STATES[agent.state]
  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="flex min-w-[300px] max-w-[52ch] flex-col gap-[3px] border border-(--d-dim) bg-(--d-bg) px-3 py-[9px] text-left text-xs tracking-[0.03em]"
    >
      <div className="overflow-hidden text-ellipsis whitespace-nowrap text-(--d-fg)">
        {agent.title || agent.agent}
      </div>
      <div
        className="overflow-hidden text-ellipsis whitespace-nowrap"
        style={{ color: s.color }}
      >
        {s.glyph} {s.label} · {agentAge(agent.age)} ago
      </div>
      {agent.detail ? (
        <div className="overflow-hidden text-ellipsis whitespace-nowrap text-(--d-dim)">
          {agent.detail}
        </div>
      ) : null}
      <div className="overflow-hidden text-ellipsis whitespace-nowrap text-(--d-dim)">
        {agentTmuxLine(agent)}
      </div>
      <div className="mt-1.5 text-[10px] text-(--d-dim)">
        click cell to jump
      </div>
    </div>
  )
}
