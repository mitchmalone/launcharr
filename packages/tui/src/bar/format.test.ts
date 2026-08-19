import { describe, expect, it } from 'vitest'

import {
  agentAge,
  agentGlyph,
  agentLocation,
  agentStateLabel,
  batteryState,
  batteryTone,
  formatBarClock,
  groupAgents,
  timeLeft,
  toneClass,
  wifiBars,
  wifiSignalLabel,
} from './format'
import type { AgentSession, BatteryDetail } from './types'

const agent = (over: Partial<AgentSession> = {}): AgentSession => ({
  session: 's1',
  agent: 'claude',
  state: 'idle',
  title: '',
  detail: '',
  mux: '',
  muxTarget: '',
  updatedAt: 0,
  muxGroup: null,
  muxIndex: null,
  muxLabel: null,
  pid: null,
  pidComm: null,
  subagents: [],
  ...over,
})

const battery = (over: Partial<BatteryDetail> = {}): BatteryDetail => ({
  pct: 64,
  onAc: false,
  charging: false,
  fullyCharged: false,
  cycleCount: null,
  capacityWh: null,
  designWh: null,
  healthPct: null,
  minutesRemaining: null,
  batteryWatts: null,
  systemWatts: null,
  powerMode: null,
  ...over,
})

describe('agent state presentation', () => {
  it('maps wire states to glyphs, unknown falls back to idle', () => {
    expect(agentGlyph('working')).toBe('●')
    expect(agentGlyph('attention')).toBe('◉')
    expect(agentGlyph('nonsense')).toBe('○')
  })

  it('relabels the wire states that read wrong, passes others through', () => {
    // `attention` is the wire name; "blocked" is what a human should read.
    expect(agentStateLabel('attention')).toBe('blocked')
    expect(agentStateLabel('done')).toBe('done · unread')
    expect(agentStateLabel('working')).toBe('working')
  })
})

describe('agentAge', () => {
  const now = new Date(1_000_000 * 1000)
  const at = (secondsAgo: number) => agentAge(1_000_000 - secondsAgo, now)

  it('formats seconds, then rounded minutes, then rounded hours', () => {
    expect(at(0)).toBe('0s')
    expect(at(59)).toBe('59s')
    expect(at(60)).toBe('1m')
    expect(at(3599)).toBe('60m')
    expect(at(3600)).toBe('1h')
    expect(at(7000)).toBe('2h')
  })

  it('clamps a future timestamp to zero rather than printing negatives', () => {
    expect(at(-500)).toBe('0s')
  })
})

describe('agentLocation', () => {
  it('renders session, tab, and window name when present', () => {
    expect(
      agentLocation(
        agent({
          muxGroup: 'fable',
          muxIndex: 2,
          muxLabel: 'release',
        }),
      ),
    ).toBe('fable · tab 2 · release')
  })

  it('omits the window name when it is empty', () => {
    expect(
      agentLocation(agent({ muxGroup: 'www', muxIndex: 1, muxLabel: '' })),
    ).toBe('www · tab 1')
  })

  it('says so when the agent has no pane', () => {
    expect(agentLocation(agent())).toBe('outside a multiplexer')
  })
})

describe('groupAgents', () => {
  it('groups by tmux session name, ordering groups alphabetically', () => {
    const { groups } = groupAgents([
      agent({ session: 'b', muxGroup: 'www', muxIndex: 1 }),
      agent({ session: 'a', muxGroup: 'fable', muxIndex: 1 }),
    ])
    expect(groups.map(([name]) => name)).toEqual(['fable', 'www'])
  })

  it('orders cells within a group by tab index, not arrival order', () => {
    const { groups } = groupAgents([
      agent({ session: 'late', muxGroup: 'fable', muxIndex: 3 }),
      agent({ session: 'early', muxGroup: 'fable', muxIndex: 1 }),
    ])
    expect(groups[0]![1].map((a) => a.session)).toEqual(['early', 'late'])
  })

  it('breaks equal tab indexes on session id so order is stable', () => {
    const { groups } = groupAgents([
      agent({ session: 'z', muxGroup: 'fable', muxIndex: 1 }),
      agent({ session: 'a', muxGroup: 'fable', muxIndex: 1 }),
    ])
    expect(groups[0]![1].map((a) => a.session)).toEqual(['a', 'z'])
  })

  it('keeps agents outside tmux as loose cells, sorted by session', () => {
    const { groups, loose } = groupAgents([
      agent({ session: 'z' }),
      agent({ session: 'a' }),
    ])
    expect(groups).toEqual([])
    expect(loose.map((a) => a.session)).toEqual(['a', 'z'])
  })
})

describe('formatBarClock', () => {
  it('renders sketchybar parity with zero-padded 24h time', () => {
    // 2026-08-16 is a Sunday; 07:45 local.
    expect(formatBarClock(new Date(2026, 7, 16, 7, 45))).toBe(
      'Sun 16 Aug 07:45',
    )
  })
})

describe('timeLeft', () => {
  it('drops the hour part below an hour', () => {
    expect(timeLeft(58)).toBe('58m')
  })

  it('splits hours and minutes above one', () => {
    expect(timeLeft(298)).toBe('4h 58m')
    expect(timeLeft(120)).toBe('2h 0m')
  })
})

describe('batteryState', () => {
  it('reports charging over every other condition', () => {
    expect(batteryState(battery({ charging: true, onAc: true }))).toBe(
      'charging',
    )
  })

  it('distinguishes charged from plugged-in-but-idle', () => {
    expect(batteryState(battery({ onAc: true, fullyCharged: true }))).toBe(
      'charged',
    )
    expect(batteryState(battery({ onAc: true }))).toBe(
      'AC attached · not charging',
    )
  })

  it('falls through to discharging on battery', () => {
    expect(batteryState(battery())).toBe('discharging')
  })
})

describe('cell tones', () => {
  it('warns under 50% and alarms under 20%, on battery only', () => {
    expect(batteryTone(64, false, false)).toBe('normal')
    expect(batteryTone(45, false, false)).toBe('warn')
    expect(batteryTone(12, false, false)).toBe('danger')
  })

  it('stays calm while charging or on AC, however low', () => {
    expect(batteryTone(5, false, true)).toBe('normal')
    expect(batteryTone(5, true, false)).toBe('normal')
  })

  it('emits classes the CSS actually scopes under .bar-right', () => {
    expect(toneClass('normal')).toBe('bar-cell')
    expect(toneClass('warn')).toBe('bar-cell bar-warn')
    expect(toneClass('danger')).toBe('bar-cell bar-danger')
  })
})

describe('wifi strength', () => {
  it('maps RSSI to bars, unknown to full', () => {
    expect(wifiBars(null)).toBe(4)
    expect(wifiBars(-45)).toBe(4)
    expect(wifiBars(-60)).toBe(4)
    expect(wifiBars(-61)).toBe(3)
    expect(wifiBars(-70)).toBe(3)
    expect(wifiBars(-75)).toBe(2)
    expect(wifiBars(-81)).toBe(1)
  })
  it('labels the card line', () => {
    expect(wifiSignalLabel(null)).toBe('')
    expect(wifiSignalLabel(-66)).toBe('-66 dBm · good')
    expect(wifiSignalLabel(-85)).toBe('-85 dBm · poor')
  })
})
