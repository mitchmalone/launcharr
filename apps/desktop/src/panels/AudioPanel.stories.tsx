import { defineStories } from '@launcharr/tui'

import { AudioPanel, type AudioStatus } from './AudioPanel'

const STATUS: AudioStatus = {
  outputVolume: 30,
  inputVolume: 80,
  outputMuted: false,
  outputs: [
    { id: 83, name: 'Laptop Speakers' },
    { id: 59, name: 'Shure MV7+' },
    { id: 61, name: 'LSX II LT' },
  ],
  inputs: [
    { id: 90, name: 'Logi 4K Pro' },
    { id: 91, name: 'Microphone' },
    { id: 92, name: 'Cam Link 4K' },
    { id: 59, name: 'Shure MV7+' },
  ],
  defaultOutput: 61,
  defaultInput: 59,
}

const noop = () => {}
const base = {
  error: null,
  onSetVolume: noop,
  onSetDefault: noop,
  onToggleMute: noop,
  onClose: noop,
}

export const audioPanelStories = defineStories('AudioPanel (app)', [
  {
    name: 'easy listening',
    keys: '↑↓ move · ←→ volume · ↵ set device · m mute · esc back',
    render: () => <AudioPanel {...base} status={STATUS} />,
  },
  {
    name: 'muted',
    render: () => (
      <AudioPanel {...base} status={{ ...STATUS, outputMuted: true }} />
    ),
  },
  {
    name: 'no input devices',
    render: () => (
      <AudioPanel
        {...base}
        status={{
          ...STATUS,
          inputs: [],
          inputVolume: null,
          defaultInput: null,
        }}
      />
    ),
  },
  {
    name: 'loading',
    render: () => <AudioPanel {...base} status={null} />,
  },
  {
    name: 'switch failed',
    render: () => (
      <AudioPanel
        {...base}
        status={STATUS}
        error="CoreAudio set default failed (-50)"
      />
    ),
  },
])
