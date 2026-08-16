import { defineStories } from '@launcharr/tui'

import { UsagePanel, type UsageReport } from './UsagePanel'

const NOW = 1_800_000_000

const REPORT: UsageReport = {
  generatedAt: NOW,
  providers: [
    {
      provider: 'claude',
      days: [
        { label: 'Mon', tokens: 169_799_887 },
        { label: 'Tue', tokens: 271_782_498 },
        { label: 'Wed', tokens: 141_464_960 },
        { label: 'Thu', tokens: 92_420_456 },
        { label: 'Fri', tokens: 110_119_941 },
        { label: 'Sat', tokens: 26_440_629 },
        { label: 'Today', tokens: 114_553_427 },
      ],
      models: [
        { model: 'claude-fable-5', tokens: 732_787_128 },
        { model: 'claude-opus-5', tokens: 193_794_670 },
      ],
      limits: [
        { name: '5h session', usedPercent: 62.5, resetsAt: NOW + 3 * 3600 },
        {
          name: 'weekly · all models',
          usedPercent: 41,
          resetsAt: NOW + 3 * 86_400,
        },
        { name: 'weekly · opus', usedPercent: 12, resetsAt: NOW + 3 * 86_400 },
        { name: 'weekly · Fable', usedPercent: 88, resetsAt: NOW + 2 * 86_400 },
      ],
      limitsNote: null,
    },
    {
      provider: 'codex',
      days: [
        { label: 'Mon', tokens: 0 },
        { label: 'Tue', tokens: 0 },
        { label: 'Wed', tokens: 2_964_211 },
        { label: 'Thu', tokens: 0 },
        { label: 'Fri', tokens: 0 },
        { label: 'Sat', tokens: 0 },
        { label: 'Today', tokens: 0 },
      ],
      models: [{ model: 'gpt-5.5', tokens: 2_964_211 }],
      limits: [
        { name: 'weekly', usedPercent: 5, resetsAt: NOW + 4 * 86_400 },
        { name: '5h', usedPercent: 40, resetsAt: NOW + 2 * 3600 },
      ],
      limitsNote: null,
    },
  ],
}

const noop = () => {}

export const usagePanelStories = defineStories('UsagePanel (app)', [
  {
    name: 'claude — tokens by day/model',
    keys: '←→ provider · esc back',
    render: () => (
      <UsagePanel
        report={REPORT}
        selected="claude"
        nowSecs={NOW}
        onSelect={noop}
        onClose={noop}
      />
    ),
  },
  {
    name: 'codex — weekly rate limit',
    render: () => (
      <UsagePanel
        report={REPORT}
        selected="codex"
        nowSecs={NOW}
        onSelect={noop}
        onClose={noop}
      />
    ),
  },
  {
    name: 'scanning (first open)',
    render: () => (
      <UsagePanel
        report={null}
        selected="claude"
        nowSecs={NOW}
        onSelect={noop}
        onClose={noop}
      />
    ),
  },
  {
    name: 'quiet week',
    render: () => (
      <UsagePanel
        report={{
          generatedAt: NOW,
          providers: [
            {
              provider: 'claude',
              days: (REPORT.providers[0]?.days ?? []).map((d) => ({
                ...d,
                tokens: 0,
              })),
              models: [],
              limits: [],
              limitsNote: 'account limits off — enable in Settings → Agents',
            },
          ],
        }}
        selected="claude"
        nowSecs={NOW}
        onSelect={noop}
        onClose={noop}
      />
    ),
  },
])
