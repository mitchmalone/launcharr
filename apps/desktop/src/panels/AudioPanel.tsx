/**
 * Audio panel, presentational half (Omarchy audio screen): OUTPUT slider +
 * device list, INPUT slider + device list. Pure props + @launcharr/tui — the
 * container owns invokes. Keyboard: ↑↓ move, ←→ adjust a selected slider,
 * ⏎ makes a device the default, m toggles mute.
 */
import {
  KeyHints,
  ListRow,
  Panel,
  SectionHeader,
  Slider,
  useListNav,
} from '@launcharr/tui'

export interface AudioDevice {
  id: number
  name: string
}

/** Mirrors AudioStatus in audio.rs. */
export interface AudioStatus {
  outputVolume: number | null
  inputVolume: number | null
  outputMuted: boolean
  outputs: AudioDevice[]
  inputs: AudioDevice[]
  defaultOutput: number | null
  defaultInput: number | null
}

export interface AudioPanelProps {
  status: AudioStatus | null
  error: string | null
  onSetVolume: (input: boolean, pct: number) => void
  onSetDefault: (id: number, input: boolean) => void
  onToggleMute: () => void
  onClose: () => void
}

const VOLUME_STEP = 5

export function AudioPanel({
  status,
  error,
  onSetVolume,
  onSetDefault,
  onToggleMute,
  onClose,
}: AudioPanelProps) {
  const outputs = status?.outputs ?? []
  const inputs = status?.inputs ?? []
  // Keyboard order mirrors the layout: output slider, output devices, input
  // slider, input devices.
  const outputSlider = 0
  const outputsBase = 1
  const inputSlider = outputsBase + outputs.length
  const inputsBase = inputSlider + 1
  const count = inputsBase + inputs.length

  const nav = useListNav(count, {
    onActivate: (i) => {
      const output = outputs[i - outputsBase]
      if (output) onSetDefault(output.id, false)
      const input = inputs[i - inputsBase]
      if (input) onSetDefault(input.id, true)
    },
    onBack: onClose,
  })

  const adjust = (input: boolean, delta: number) => {
    const current = input ? status?.inputVolume : status?.outputVolume
    if (current == null) return
    onSetVolume(
      input,
      Math.min(100, Math.max(0, current + delta * VOLUME_STEP)),
    )
  }

  const subtitle = !status
    ? 'loading…'
    : status.outputMuted
      ? 'muted'
      : (outputs.find((d) => d.id === status.defaultOutput)?.name ?? 'Audio')

  const deviceRow = (device: AudioDevice, index: number, input: boolean) => {
    const isDefault =
      device.id === (input ? status?.defaultInput : status?.defaultOutput)
    return (
      <ListRow
        key={`${input ? 'in' : 'out'}-${device.id}`}
        icon={input ? '◦' : '▯'}
        label={device.name}
        selected={index === nav.index}
        right={isDefault ? '●' : undefined}
        onClick={() => onSetDefault(device.id, input)}
        onHover={() => nav.setIndex(index)}
      />
    )
  }

  const sliderBlock = (input: boolean, index: number) => {
    const value = input ? status?.inputVolume : status?.outputVolume
    const muted = !input && (status?.outputMuted ?? false)
    return (
      <div
        className={index === nav.index ? 'tui-row-selected' : undefined}
        onMouseMove={() => nav.setIndex(index)}
      >
        <SectionHeader
          label={input ? 'Input' : 'Output'}
          right={
            value == null ? '—' : muted ? `muted · ${value}%` : `${value}%`
          }
        />
        <Slider
          value={value ?? 0}
          step={VOLUME_STEP}
          label={input ? 'Input volume' : 'Output volume'}
          onChange={(v) => onSetVolume(input, v)}
        />
      </div>
    )
  }

  return (
    <Panel
      autoFocus
      icon="◀"
      title="Audio"
      subtitle={subtitle}
      onKeyDown={(e) => {
        if (e.key === 'm') {
          e.preventDefault()
          onToggleMute()
          return
        }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          const delta = e.key === 'ArrowLeft' ? -1 : 1
          if (nav.index === outputSlider) {
            e.preventDefault()
            adjust(false, delta)
            return
          }
          if (nav.index === inputSlider) {
            e.preventDefault()
            adjust(true, delta)
            return
          }
        }
        nav.onKeyDown(e)
      }}
      footer={
        <KeyHints
          hints={[
            { keys: '↑↓', label: 'move' },
            { keys: '←→', label: 'volume' },
            { keys: '↵', label: 'set device' },
            { keys: 'm', label: status?.outputMuted ? 'unmute' : 'mute' },
            { keys: 'esc', label: 'back' },
          ]}
        />
      }
    >
      {error && <ListRow icon="✕" label={error} right="" dim />}
      {sliderBlock(false, outputSlider)}
      {outputs.length === 0 ? (
        <ListRow dim label={status ? 'no output devices' : 'loading…'} />
      ) : (
        outputs.map((d, i) => deviceRow(d, outputsBase + i, false))
      )}
      {sliderBlock(true, inputSlider)}
      {inputs.length === 0 ? (
        <ListRow dim label={status ? 'no input devices' : 'loading…'} />
      ) : (
        inputs.map((d, i) => deviceRow(d, inputsBase + i, true))
      )}
    </Panel>
  )
}
