'use client'

import { AGENT_GROUPS, AGENT_STATES, type Agent } from '@/lib/demo-data'

/**
 * The bar's agent module: one glyph per session, boxed by tmux session, ordered
 * by tab. Hand-rolled rather than a Radix tooltip — the hover card lives inside
 * a fake menubar and has to look like the bar drew it, not like web chrome.
 */
export function AgentCells({
  onHover,
  hovered,
  size = 'bar',
}: {
  onHover: (agent: Agent | null) => void
  hovered: Agent | null
  size?: 'bar' | 'spotlight'
}) {
  const big = size === 'spotlight'
  return (
    <div
      className="flex items-center gap-1.5"
      onMouseLeave={() => onHover(null)}
    >
      {AGENT_GROUPS.map((group, gi) => (
        <div
          key={gi}
          className="flex items-center gap-1 border border-(--d-dim)"
          style={{ height: big ? 26 : 22, padding: big ? '0 6px' : '0 5px' }}
        >
          {group.map((a) => {
            const s = AGENT_STATES[a.state]
            return (
              <button
                key={a.id}
                type="button"
                aria-label={`${a.title} — ${s.label}`}
                onMouseEnter={() => onHover(a)}
                onFocus={() => onHover(a)}
                className="cursor-pointer border-none bg-transparent text-center"
                style={{
                  minWidth: big ? 20 : 16,
                  height: big ? 22 : 18,
                  lineHeight: big ? '22px' : '18px',
                  fontSize: big ? 14 : 12,
                  color: s.color,
                  animation:
                    a.state === 'blocked'
                      ? 'bar-agent-breathe 1.6s ease-in-out infinite'
                      : undefined,
                  outline:
                    hovered?.id === a.id ? '1px solid currentColor' : undefined,
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

/** The card the bar pops under a hovered agent cell. */
export function AgentHoverCard({
  agent,
  showLine1 = false,
}: {
  agent: Agent
  showLine1?: boolean
}) {
  const s = AGENT_STATES[agent.state]
  return (
    <div className="flex min-w-[300px] max-w-[52ch] flex-col gap-[3px] border border-(--d-dim) bg-(--d-glass) px-3 py-2.5 text-left text-xs tracking-[0.03em]">
      <div className="overflow-hidden text-ellipsis whitespace-nowrap text-(--d-fg)">
        {agent.title}
      </div>
      <div style={{ color: s.color }}>{s.label}</div>
      {showLine1 ? (
        <div className="overflow-hidden text-ellipsis whitespace-nowrap text-(--d-dim)">
          {agent.line1}
        </div>
      ) : null}
      <div className="overflow-hidden text-ellipsis whitespace-nowrap text-(--d-dim)">
        {agent.line2}
      </div>
      <div className="mt-0.5 text-[10px] text-(--d-dim)">
        click cell to jump
      </div>
    </div>
  )
}
