/**
 * Awake panel, presentational half: pure props + @launcharr/tui, no tauri
 * imports. The copy is the feature (plans/active/awake.md): every string says
 * what the user observes, states how it ends, and carries its limitation
 * inline. The words themselves live in @launcharr/core/awake where they're
 * shared with the grammar rows and the bar card.
 */
import type { AwakeSpec, AwakeStatus, AwakeUntil } from '@launcharr/core/awake'
import {
  DEFAULT_FLOOR,
  endsLabel,
  formatClock,
  formatMinutes,
  formatSeconds,
  holdLabel,
  parseSpec,
} from '@launcharr/core/awake'
import { KeyHints, ListRow, Panel, SectionHeader } from '@launcharr/tui'
import { Coffee } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'

const HEAD_ICON = { size: 17, strokeWidth: 2, 'aria-hidden': true } as const

const DURATIONS = [15, 30, 60, 120, 240, 480]

export interface AwakePanelProps {
  status: AwakeStatus | null
  /** Any agent working or blocked right now — picks the default end. */
  agentsActive: boolean
  /** Agent monitoring enabled in Settings → Agents. */
  agentsMonitorOn: boolean
  runningApps: string[]
  currentSsid: string | null
  onArm: (spec: AwakeSpec) => void
  onRelease: () => void
  onClose: () => void
}

/** The form's values — everything ⏎ turns into an AwakeSpec. */
interface Form {
  screen: boolean
  disks: boolean
  untilKind: AwakeUntil['kind']
  timerMinutes: number
  clockHour: number
  clockMinute: number
  app: string
  floor: boolean
}

const DEFAULT_FORM: Form = {
  screen: false,
  disks: false,
  untilKind: 'manual',
  timerMinutes: 120,
  clockHour: 18,
  clockMinute: 0,
  app: '',
  floor: true,
}

function formUntil(f: Form, ssid: string | null): AwakeUntil {
  switch (f.untilKind) {
    case 'timer':
      return { kind: 'timer', minutes: f.timerMinutes }
    case 'clock':
      return { kind: 'clock', hour: f.clockHour, minute: f.clockMinute }
    case 'app':
      return { kind: 'app', app: f.app }
    case 'wifi':
      return { kind: 'wifi', ssid: ssid ?? '' }
    case 'agents':
    case 'power':
    case 'display':
    case 'busy':
      return { kind: f.untilKind }
    default:
      return { kind: 'manual' }
  }
}

export function AwakePanel(props: AwakePanelProps) {
  const armed = props.status?.state.armed ?? false
  return armed ? <ArmedView {...props} /> : <FormView {...props} />
}

/* ---- armed ------------------------------------------------------------ */

function ArmedView({ status, onRelease, onClose }: AwakePanelProps) {
  const s = status!.state
  const spec = parseSpec(s.spec)
  const ends = spec ? endsLabel(spec.until, s.untilEpochMs) : 'until turned off'
  const remaining =
    s.untilEpochMs != null
      ? formatSeconds(
          Math.max(0, Math.round((s.untilEpochMs - Date.now()) / 1000)),
        )
      : null
  return (
    <Panel
      autoFocus
      icon={<Coffee {...HEAD_ICON} />}
      title="Awake"
      subtitle={`${formatSeconds(s.elapsedSeconds)}${s.resumed ? ' since relaunch' : ''} · ${ends}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          onRelease()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          onClose()
        }
      }}
      footer={
        <KeyHints
          hints={[
            { keys: '⏎', label: 'turn off' },
            { keys: 'esc', label: 'close' },
          ]}
        />
      }
    >
      <ListRow
        icon="●"
        label={spec ? holdLabel(spec.screen, spec.disks) : 'Mac stays awake'}
        right={formatSeconds(s.elapsedSeconds)}
      />
      <ListRow
        dim
        label={`Ends ${ends}${remaining ? ` — ${remaining} left` : ''}`}
      />
      {s.batteryFloor != null && (
        <ListRow
          dim
          label={`Lets go if the battery drops below ${s.batteryFloor}% unplugged.`}
        />
      )}
      <OthersList status={status} />
    </Panel>
  )
}

function OthersList({ status }: { status: AwakeStatus | null }) {
  const others = status?.others ?? []
  if (others.length === 0) return null
  return (
    <>
      <SectionHeader label="Also keeping this Mac awake" />
      {others.map((h) => (
        <ListRow
          key={h.app}
          dim
          label={h.app}
          right={formatSeconds(h.seconds)}
        />
      ))}
    </>
  )
}

/* ---- the form ---------------------------------------------------------- */

interface FormRow {
  id: string
  render: (selected: boolean, hoverTo: () => void) => ReactNode
  onSpace?: () => void
  onLeftRight?: (delta: number) => void
}

function FormView({
  status,
  agentsActive,
  agentsMonitorOn,
  runningApps,
  currentSsid,
  onArm,
  onClose,
}: AwakePanelProps) {
  const [form, setForm] = useState<Form>(DEFAULT_FORM)
  const [index, setIndex] = useState(0)

  // Default the end condition once, when we first learn whether agents are
  // busy: a Mac mid-agent-run wants the session that follows the work.
  const defaulted = useRef(false)
  useEffect(() => {
    if (defaulted.current || !agentsMonitorOn) return
    defaulted.current = true
    if (agentsActive) setForm((f) => ({ ...f, untilKind: 'agents' }))
  }, [agentsActive, agentsMonitorOn])

  // Keep a chosen app once the list loads; never overwrite a user pick.
  useEffect(() => {
    if (!form.app && runningApps.length > 0) {
      setForm((f) => (f.app ? f : { ...f, app: runningApps[0]! }))
    }
  }, [runningApps, form.app])

  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }))
  const pick = (untilKind: Form['untilKind']) => set({ untilKind })

  const radio = (on: boolean) => (on ? '●' : '○')
  const check = (on: boolean) => (on ? '☑' : '☐')

  const rows: FormRow[] = []
  const row = (r: FormRow) => rows.push(r)

  const listRow = (
    icon: string,
    label: ReactNode,
    sub: ReactNode,
    right: ReactNode,
    onSpace: () => void,
    onLeftRight?: (delta: number) => void,
  ): FormRow => ({
    id: String(label),
    render: (selected, hoverTo) => (
      <ListRow
        key={String(label)}
        icon={icon}
        label={label}
        sub={sub}
        right={right}
        selected={selected}
        onClick={onSpace}
        onHover={hoverTo}
      />
    ),
    onSpace,
    onLeftRight,
  })

  row(
    listRow(
      radio(!form.screen),
      'Mac stays awake, screen can sleep',
      'Work keeps running. The screen turns off as usual and locks if you’ve set it to.',
      undefined,
      () => set({ screen: false }),
    ),
  )
  row(
    listRow(
      radio(form.screen),
      'Mac and screen both stay on',
      'Nothing turns off. For dashboards, presentations, or watching a long run.',
      undefined,
      () => set({ screen: true }),
    ),
  )
  row(
    listRow(
      check(form.disks),
      'Also keep connected drives spinning',
      'Stops external disks parking mid-copy. No effect on internal storage.',
      undefined,
      () => set({ disks: !form.disks }),
    ),
  )
  const untilRows: FormRow[] = []
  untilRows.push(
    listRow(
      radio(form.untilKind === 'manual'),
      'Until I turn it off',
      undefined,
      undefined,
      () => pick('manual'),
    ),
  )
  untilRows.push(
    listRow(
      radio(form.untilKind === 'timer'),
      `For ${formatMinutes(form.timerMinutes)}`,
      undefined,
      '←→ 15m · 30m · 1h · 2h · 4h · 8h',
      () => pick('timer'),
      (delta) => {
        const at = DURATIONS.indexOf(form.timerMinutes)
        const next =
          DURATIONS[Math.min(DURATIONS.length - 1, Math.max(0, at + delta))]!
        set({ untilKind: 'timer', timerMinutes: next })
      },
    ),
  )
  untilRows.push(
    listRow(
      radio(form.untilKind === 'clock'),
      `Until ${formatClock(form.clockHour, form.clockMinute)}`,
      undefined,
      '←→ adjust',
      () => pick('clock'),
      (delta) => {
        const total =
          (form.clockHour * 60 + form.clockMinute + delta * 30 + 1440) % 1440
        set({
          untilKind: 'clock',
          clockHour: Math.floor(total / 60),
          clockMinute: total % 60,
        })
      },
    ),
  )
  if (agentsMonitorOn) {
    untilRows.push(
      listRow(
        radio(form.untilKind === 'agents'),
        'While agents are working',
        'Releases about a minute after the last agent goes idle. An agent waiting on you still counts as working; a finished agent doesn’t.',
        undefined,
        () => pick('agents'),
      ),
    )
  }
  untilRows.push(
    listRow(
      radio(form.untilKind === 'app'),
      form.app ? `While ${form.app} is running` : 'While an app is running',
      'Releases shortly after it quits.',
      runningApps.length > 1 ? '←→ pick app' : undefined,
      () => pick('app'),
      (delta) => {
        if (runningApps.length === 0) return
        const at = Math.max(0, runningApps.indexOf(form.app))
        const next =
          runningApps[(at + delta + runningApps.length) % runningApps.length]!
        set({ untilKind: 'app', app: next })
      },
    ),
  )
  untilRows.push(
    listRow(
      radio(form.untilKind === 'power'),
      'While plugged in',
      'Releases when the power cable comes out.',
      undefined,
      () => pick('power'),
    ),
  )
  if (currentSsid) {
    untilRows.push(
      listRow(
        radio(form.untilKind === 'wifi'),
        `While on ${currentSsid}`,
        'Releases a minute after this Mac leaves the network.',
        undefined,
        () => pick('wifi'),
      ),
    )
  }
  untilRows.push(
    listRow(
      radio(form.untilKind === 'display'),
      'While an external display is attached',
      'Releases when the display disconnects.',
      undefined,
      () => pick('display'),
    ),
  )
  untilRows.push(
    listRow(
      radio(form.untilKind === 'busy'),
      'While the Mac is busy',
      'Watches processor and network. Releases after 5 quiet minutes.',
      undefined,
      () => pick('busy'),
    ),
  )
  const untilStart = rows.length
  rows.push(...untilRows)

  const floorRow = listRow(
    check(form.floor),
    `Release if the battery drops below ${DEFAULT_FLOOR}%`,
    'Protects an unattended Mac. It sleeps normally once it hits the floor.',
    undefined,
    () => set({ floor: !form.floor }),
  )
  const floorIndex = rows.length
  rows.push(floorRow)

  const arm = () =>
    onArm({
      screen: form.screen,
      disks: form.disks,
      until: formUntil(form, currentSsid),
      floor: form.floor ? DEFAULT_FLOOR : null,
    })

  const clamped = Math.min(index, rows.length - 1)
  const releasedByFloor = status?.state.released === 'floor'

  return (
    <Panel
      autoFocus
      icon={<Coffee {...HEAD_ICON} />}
      title="Awake"
      subtitle="sleeping normally"
      onKeyDown={(e) => {
        switch (e.key) {
          case 'ArrowDown':
            e.preventDefault()
            setIndex((i) => (i + 1) % rows.length)
            return
          case 'ArrowUp':
            e.preventDefault()
            setIndex((i) => (i - 1 + rows.length) % rows.length)
            return
          case 'ArrowLeft':
          case 'ArrowRight':
            e.preventDefault()
            rows[clamped]?.onLeftRight?.(e.key === 'ArrowRight' ? 1 : -1)
            return
          case ' ':
            e.preventDefault()
            rows[clamped]?.onSpace?.()
            return
          case 'Enter':
            e.preventDefault()
            arm()
            return
          case 'Escape':
            e.preventDefault()
            onClose()
            return
        }
      }}
      footer={
        <KeyHints
          hints={[
            { keys: '↑↓', label: 'move' },
            { keys: '←→', label: 'adjust' },
            { keys: 'space', label: 'choose' },
            { keys: '⏎', label: 'start' },
            { keys: 'esc', label: 'close' },
          ]}
        />
      }
    >
      <div className="tui-scroll">
        {releasedByFloor && (
          <ListRow
            icon="◇"
            dim
            label="The last session let go at the battery floor — the Mac sleeps normally again."
          />
        )}
        <SectionHeader label="What stays on" />
        {rows.slice(0, untilStart).map((r, i) => (
          <span key={r.id}>{r.render(i === clamped, () => setIndex(i))}</span>
        ))}
        <SectionHeader label="Until" />
        {untilRows.map((r, i) => (
          <span key={r.id}>
            {r.render(untilStart + i === clamped, () =>
              setIndex(untilStart + i),
            )}
          </span>
        ))}
        <SectionHeader label="Rails" />
        <span key={floorRow.id}>
          {floorRow.render(floorIndex === clamped, () => setIndex(floorIndex))}
        </span>
        <ListRow
          dim
          icon="☐"
          label="Stay awake with the lid closed on battery"
          sub="macOS always sleeps on lid-close off AC; overriding it is a later opt-in install (one admin password). Plugged in, lid closed already works — nothing to set up."
          right="needs helper"
        />
        <OthersList status={status} />
      </div>
    </Panel>
  )
}
