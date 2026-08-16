/**
 * Usage panel, presentational half: CodexBar-inspired token monitor rendered
 * from local journal aggregates (usage.rs). Pure props + @launcharr/tui — the
 * container (UsagePanelContainer) owns invokes and refresh.
 */
import {
  KeyHints,
  MeterRow,
  Panel,
  SectionHeader,
  SegmentedControl,
} from '@launcharr/tui'

/** Mirrors usage.rs (UsageReport et al). */
export interface DayUsage {
  label: string
  tokens: number
}
export interface ModelUsage {
  model: string
  tokens: number
}
export interface RateLimit {
  usedPercent: number
  windowMinutes: number
  resetsAt: number | null
  plan: string | null
}
export interface ProviderUsage {
  provider: string
  days: DayUsage[]
  models: ModelUsage[]
  rateLimit: RateLimit | null
}
export interface UsageReport {
  generatedAt: number
  providers: ProviderUsage[]
}

const PROVIDER_LABELS: Record<string, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
}

/** 218234567 → "218.2M", 927000000 → "927M", 1600 → "1.6k", 42 → "42". */
export function fmtTokens(n: number): string {
  const scaled = (value: number, unit: string) => {
    const s = value.toFixed(1).replace(/\.0$/, '')
    return `${s}${unit}`
  }
  if (n >= 1e9) return scaled(n / 1e9, 'B')
  if (n >= 1e6) return scaled(n / 1e6, 'M')
  if (n >= 1e3) return scaled(n / 1e3, 'k')
  return String(n)
}

/** 10080 minutes → "weekly", 300 → "5h", 90 → "90m". */
export function fmtWindow(minutes: number): string {
  if (minutes === 10_080) return 'weekly'
  if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60}h`
  return `${minutes}m`
}

/** Seconds until reset → "resets in 4d" / "resets in 7h" / "resets soon". */
export function fmtReset(resetsAt: number | null, nowSecs: number): string {
  if (resetsAt == null) return ''
  const s = resetsAt - nowSecs
  if (s <= 0) return 'resets soon'
  if (s < 3600) return `resets in ${Math.max(1, Math.round(s / 60))}m`
  if (s < 86_400) return `resets in ${Math.round(s / 3600)}h`
  return `resets in ${Math.round(s / 86_400)}d`
}

export interface UsagePanelProps {
  report: UsageReport | null
  selected: string
  /** Unix seconds "now", injected so stories render deterministic countdowns. */
  nowSecs: number
  onSelect: (provider: string) => void
  onClose: () => void
}

export function UsagePanel({
  report,
  selected,
  nowSecs,
  onSelect,
  onClose,
}: UsagePanelProps) {
  const providers = report?.providers ?? []
  const active =
    providers.find((p) => p.provider === selected) ?? providers[0] ?? null
  const scanning = report == null || report.generatedAt === 0

  const cycle = (step: number) => {
    if (providers.length === 0 || !active) return
    const i = providers.findIndex((p) => p.provider === active.provider)
    const next = providers[(i + step + providers.length) % providers.length]
    if (next) onSelect(next.provider)
  }

  const dayMax = Math.max(1, ...(active?.days.map((d) => d.tokens) ?? []))
  const modelMax = Math.max(1, ...(active?.models.map((m) => m.tokens) ?? []))
  const windowTotal = active?.days.reduce((sum, d) => sum + d.tokens, 0) ?? 0

  return (
    <Panel
      autoFocus
      icon="▤"
      title="Usage"
      subtitle={
        scanning
          ? 'scanning journals…'
          : `${fmtTokens(windowTotal)} tokens · 7 days`
      }
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey)) {
          e.preventDefault()
          cycle(-1)
        } else if (e.key === 'ArrowRight' || e.key === 'Tab') {
          e.preventDefault()
          cycle(1)
        } else if (e.key === 'Escape') {
          e.preventDefault()
          onClose()
        }
      }}
      footer={
        <KeyHints
          hints={[
            { keys: '←→', label: 'provider' },
            { keys: 'esc', label: 'back' },
          ]}
        />
      }
    >
      <SegmentedControl
        options={providers.map((p) => ({
          value: p.provider,
          label: PROVIDER_LABELS[p.provider] ?? p.provider,
        }))}
        value={active?.provider ?? ''}
        onChange={onSelect}
      />
      {active && (
        <>
          <SectionHeader label="Tokens by day" />
          {active.days.map((d) => (
            <MeterRow
              key={d.label}
              label={d.label}
              value={d.tokens}
              max={dayMax}
              right={fmtTokens(d.tokens)}
              emphasis={d.label === 'Today'}
            />
          ))}
          <SectionHeader label="Tokens by model" />
          {active.models.length === 0 ? (
            <MeterRow label="no usage in the last 7 days" value={0} right="" />
          ) : (
            active.models.map((m) => (
              <MeterRow
                key={m.model}
                label={m.model}
                value={m.tokens}
                max={modelMax}
                right={fmtTokens(m.tokens)}
              />
            ))
          )}
          {active.rateLimit && (
            <>
              <SectionHeader
                label={`${fmtWindow(active.rateLimit.windowMinutes)} limit`}
                right={active.rateLimit.plan ?? undefined}
              />
              <MeterRow
                label={`${Math.round(active.rateLimit.usedPercent)}% used`}
                value={active.rateLimit.usedPercent}
                max={100}
                right={fmtReset(active.rateLimit.resetsAt, nowSecs)}
              />
            </>
          )}
        </>
      )}
    </Panel>
  )
}
