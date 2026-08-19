import type { AwakeStatus } from '@launcharr/core/awake'
import { defineStories } from '@launcharr/tui'

import { AwakePanel } from './AwakePanel'

const noop = () => {}
const base = {
  agentsActive: false,
  agentsMonitorOn: true,
  runningApps: ['Ghostty', 'Safari', 'Music'],
  currentSsid: 'RamenAmok',
  onArm: noop,
  onRelease: noop,
  onClose: noop,
}

const SLEEPING: AwakeStatus = {
  state: {
    armed: false,
    display: false,
    disks: false,
    elapsedSeconds: 0,
    untilEpochMs: null,
    batteryFloor: null,
    spec: null,
    released: null,
    resumed: false,
  },
  others: [
    { app: 'Terminal', seconds: 4 * 3600 + 12 * 60, display: false },
    { app: 'Music', seconds: 22 * 60, display: false },
  ],
}

const ARMED_AGENTS: AwakeStatus = {
  state: {
    armed: true,
    display: false,
    disks: false,
    elapsedSeconds: 42 * 60,
    untilEpochMs: null,
    batteryFloor: 20,
    spec: JSON.stringify({
      screen: false,
      disks: false,
      until: { kind: 'agents' },
      floor: 20,
    }),
    released: null,
    resumed: false,
  },
  others: SLEEPING.others,
}

const ARMED_TIMER: AwakeStatus = {
  state: {
    ...ARMED_AGENTS.state,
    elapsedSeconds: 40 * 60,
    untilEpochMs: Date.now() + 80 * 60_000,
    spec: JSON.stringify({
      screen: true,
      disks: false,
      until: { kind: 'timer', minutes: 120 },
      floor: 20,
    }),
  },
  others: [],
}

export const awakePanelStories = defineStories('AwakePanel (app)', [
  {
    name: 'sleeping normally',
    keys: '↑↓ move · ←→ adjust · space choose · ⏎ start · esc close',
    render: () => <AwakePanel {...base} status={SLEEPING} />,
  },
  {
    name: 'armed · while agents work',
    render: () => <AwakePanel {...base} status={ARMED_AGENTS} />,
  },
  {
    name: 'armed · 2h timer, screen on',
    render: () => <AwakePanel {...base} status={ARMED_TIMER} />,
  },
  {
    name: 'agents unmonitored (row hidden), no wifi',
    render: () => (
      <AwakePanel
        {...base}
        agentsMonitorOn={false}
        currentSsid={null}
        status={SLEEPING}
      />
    ),
  },
  {
    name: 'battery floor tripped',
    render: () => (
      <AwakePanel
        {...base}
        status={{
          state: { ...SLEEPING.state, released: 'floor' },
          others: [],
        }}
      />
    ),
  },
  {
    name: 'loading',
    render: () => <AwakePanel {...base} status={null} />,
  },
])
