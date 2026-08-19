import { describe, expect, it } from 'vitest'

import {
  adjustedPct,
  agentAge,
  agentGlyph,
  agentLocation,
  agentStateLabel,
  batteryLook,
  batteryState,
  formatBarClock,
  groupAgents,
  timeLeft,
  toneClass,
  widgetHealth,
  widgetToneClass,
  wifiBars,
  wifiSignalLabel,
  wifiTone,
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
  chargeLimit: null,
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

describe('adjusted charge', () => {
  it('treats the charge limit as full, and no limit as identity', () => {
    expect(adjustedPct(80, 80)).toBe(100)
    expect(adjustedPct(40, 80)).toBe(50)
    expect(adjustedPct(64, null)).toBe(64)
    expect(adjustedPct(64, 100)).toBe(64)
    expect(adjustedPct(85, 80)).toBe(100)
  })
})

describe('battery look', () => {
  it('draws the level tiers from the adjusted charge', () => {
    expect(batteryLook(80, false, 80)).toMatchObject({
      glyph: 'full',
      tone: 'good',
      showPct: false,
    })
    expect(batteryLook(64, false, null)).toMatchObject({
      glyph: 'full',
      tone: 'good',
    })
    expect(batteryLook(45, false, null)).toMatchObject({
      glyph: 'medium',
      tone: 'warn',
    })
    expect(batteryLook(20, false, null)).toMatchObject({
      glyph: 'low',
      tone: 'warn',
    })
    expect(batteryLook(9, false, null)).toMatchObject({
      glyph: 'warning',
      tone: 'danger',
      showPct: true,
    })
  })

  it('goes blue while charging: level glyph below 90 %, charging glyph from 90 %', () => {
    expect(batteryLook(30, true, null)).toMatchObject({
      glyph: 'medium',
      tone: 'charging',
    })
    expect(batteryLook(95, true, null)).toMatchObject({
      glyph: 'charging',
      tone: 'charging',
    })
    // 75 % on an 80 % limit is 94 % adjusted.
    expect(batteryLook(75, true, 80)).toMatchObject({
      glyph: 'charging',
      adjusted: 94,
    })
  })

  it('reads plugged-in-but-held ("AC attached; not charging") as charging', () => {
    expect(batteryLook(80, false, 80, true)).toMatchObject({
      glyph: 'charging',
      tone: 'charging',
    })
    expect(batteryLook(80, false, 80, false)).toMatchObject({ tone: 'good' })
  })
})

describe('cell tones', () => {
  it('emits classes the CSS actually scopes under .bar-right', () => {
    expect(toneClass('normal')).toBe('bar-cell')
    expect(toneClass('warn')).toBe('bar-cell bar-warn')
    expect(toneClass('danger')).toBe('bar-cell bar-danger')
  })
})

describe('wifiTone', () => {
  it('offline is danger, poor is warn, fair and up plain', () => {
    expect(wifiTone(false, -40)).toBe('danger')
    expect(wifiTone(true, -85)).toBe('warn')
    expect(wifiTone(true, -75)).toBe('normal')
    expect(wifiTone(true, -50)).toBe('normal')
    expect(wifiTone(true, null)).toBe('normal')
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

describe('widgets', () => {
  it('maps known tones to classes and ignores the rest', () => {
    expect(widgetToneClass('ok')).toBe('bar-tone-ok')
    expect(widgetToneClass('error')).toBe('bar-tone-error')
    expect(widgetToneClass('purple')).toBe('')
    expect(widgetToneClass(null)).toBe('')
  })

  it('describes health only when failing', () => {
    const now = new Date(1_000_000 * 1000)
    expect(widgetHealth(null, 999_000, now)).toBeNull()
    expect(widgetHealth('timed out after 10s', null, now)).toBe(
      'timed out after 10s',
    )
    expect(widgetHealth('exit 1: boom', 1_000_000 - 180, now)).toBe(
      'exit 1: boom · last ok 3m ago',
    )
  })
})
