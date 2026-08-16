import { BatteryMedium, Wifi } from 'lucide-react'

/**
 * A still of the bar for the explainer section — deliberately static and
 * theme-independent, the way a screenshot would be. The live, themeable one
 * lives in the demo.
 */
export function BarStrip() {
  return (
    <div className="overflow-hidden rounded-[10px] border border-(--hair)">
      <div className="relative flex h-[34px] items-center justify-between bg-[rgba(28,29,42,0.96)] px-3.5 font-mono text-xs tracking-[0.03em] text-[#b5b9d9]">
        <div className="flex items-center gap-3.5">
          <span className="font-bold text-[#ff6b8c]">❯</span>
          <div className="flex items-center gap-1.5">
            {['1', '2', '3', '4'].map((w) => (
              <span
                key={w}
                className="px-1 text-center"
                style={{
                  minWidth: 20,
                  height: 18,
                  lineHeight: '18px',
                  background: w === '2' ? '#b5b9d9' : undefined,
                  color: w === '2' ? '#1c1d2a' : '#73747c',
                  fontWeight: w === '2' ? 700 : 400,
                }}
              >
                {w}
              </span>
            ))}
          </div>
          <div className="flex h-[22px] items-center gap-1 border border-[#73747c] px-[5px]">
            <span
              className="text-center text-[#ff6b8c]"
              style={{ minWidth: 16, height: 18, lineHeight: '18px' }}
            >
              ●
            </span>
            <span
              className="text-center text-[#ff2d2d]"
              style={{
                minWidth: 16,
                height: 18,
                lineHeight: '18px',
                animation: 'bar-agent-breathe 1.6s ease-in-out infinite',
              }}
            >
              ◉
            </span>
          </div>
          <span className="text-[#73747c]">Ghostty</span>
        </div>
        <div className="absolute left-1/2 -translate-x-1/2 text-[#b5b9d9]">
          Sat 16 Aug 09:41
        </div>
        <div className="flex items-center gap-3.5 text-[#73747c]">
          <span className="inline-flex items-center gap-1.5">
            <Wifi size={14} strokeWidth={2.2} />
            Blackbeard 5G
          </span>
          <span>▣ 87%</span>
          <span className="inline-flex items-center gap-1.5">
            <BatteryMedium size={14} strokeWidth={2.2} />
            64%
          </span>
        </div>
      </div>
    </div>
  )
}
