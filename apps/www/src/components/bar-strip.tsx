import { BUILTIN_THEMES } from '@launcharr/tui/themes'
import { BatteryMedium, Wifi } from 'lucide-react'

import { AGENT_STATES } from '@/lib/demo-data'

/**
 * A still of the bar for the explainer section — deliberately fixed to the
 * default theme, the way a screenshot would be. Colours come from the kit's
 * `launcharr` tokens and the `.bar-*` rules in apps/desktop/src/bar/bar.css,
 * never hand-typed hex.
 *
 * Note `.bar-app` and `.bar-cell` are --fg, not --dim: the dim tone read too
 * dark against the strip (2026-08-16).
 */
const T = BUILTIN_THEMES.launcharr!

export function BarStrip() {
  return (
    <div className="overflow-hidden rounded-[10px] border border-(--hair)">
      <div
        className="relative flex h-[34px] items-center justify-between px-3.5 font-mono text-xs tracking-[0.03em]"
        style={{ background: T.glass, color: T.fg }}
      >
        <div className="flex items-center gap-3.5">
          <span className="font-bold" style={{ color: T.sigil }}>
            ❯
          </span>
          <div className="flex items-center gap-1.5">
            {['1', '2', '3', '4'].map((w) => {
              const active = w === '2'
              return (
                <span
                  key={w}
                  className="px-1 text-center"
                  style={{
                    minWidth: 20,
                    height: 18,
                    lineHeight: '18px',
                    background: active ? T.fg : undefined,
                    color: active ? T.bg : T.dim,
                    fontWeight: active ? 700 : 400,
                  }}
                >
                  {w}
                </span>
              )
            })}
          </div>
          <div
            className="flex h-[22px] items-center gap-1 px-[5px]"
            style={{ border: `1px solid ${T.dim}` }}
          >
            <span
              className="text-center"
              style={{
                minWidth: 16,
                height: 18,
                lineHeight: '18px',
                color: T.accent,
              }}
            >
              {AGENT_STATES.working.glyph}
            </span>
            <span
              className="text-center"
              style={{
                minWidth: 16,
                height: 18,
                lineHeight: '18px',
                color: AGENT_STATES.attention.color,
                animation: 'bar-agent-breathe 1.6s ease-in-out infinite',
              }}
            >
              {AGENT_STATES.attention.glyph}
            </span>
          </div>
          {/* .bar-app — fg */}
          <span style={{ color: T.fg }}>Ghostty</span>
        </div>
        <div
          className="absolute left-1/2 -translate-x-1/2"
          style={{ color: T.fg }}
        >
          Sat 16 Aug 09:41
        </div>
        {/* .bar-cell — fg, not dim */}
        <div className="flex items-center gap-3.5" style={{ color: T.fg }}>
          <span className="inline-flex items-center gap-[5px]">
            <Wifi size={14} strokeWidth={2.2} aria-hidden />
            Blackbeard 5G
          </span>
          <span>▣ 87%</span>
          <span className="inline-flex items-center gap-[5px]">
            <BatteryMedium size={14} strokeWidth={2.2} aria-hidden />
            64%
          </span>
        </div>
      </div>
    </div>
  )
}
