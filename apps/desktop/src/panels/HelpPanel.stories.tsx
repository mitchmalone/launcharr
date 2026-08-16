import { defineStories } from '@launcharr/tui'

import { HelpPanel, type HelpSection } from './HelpPanel'

const SECTIONS: HelpSection[] = [
  {
    label: 'Modes',
    entries: [
      {
        left: '❯',
        right: 'type to launch — apps, panes, quicklinks, math, URLs',
      },
      { left: '!', right: 'run command in iTerm2' },
      { left: ':', right: 'emoji picker' },
      { left: '?', right: 'ask claude' },
    ],
  },
  {
    label: 'Panels',
    entries: [
      { left: 'wifi', right: 'Wi-Fi — networks & power' },
      { left: 'usage', right: 'Usage — token monitor' },
      { left: 'help', right: 'Help — commands & keys' },
    ],
  },
  {
    label: 'Commands',
    entries: [
      { left: 'mute', right: 'Toggle Mute' },
      { left: 'sleep', right: 'Sleep' },
      { left: 'caffeine', right: 'Keep Awake' },
    ],
  },
  {
    label: 'Scripts',
    entries: [
      { left: 'gh', right: 'GitHub repos — open a repo in the browser' },
    ],
  },
]

const noop = () => {}

export const helpPanelStories = defineStories('HelpPanel (app)', [
  {
    name: 'full reference',
    keys: '↑↓ move · esc back · type to filter',
    render: () => <HelpPanel sections={SECTIONS} onClose={noop} />,
  },
  {
    name: 'two sections',
    render: () => <HelpPanel sections={SECTIONS.slice(0, 2)} onClose={noop} />,
  },
])
