import { defineStories } from '@launcharr/tui'

import { AerospacePanel, type AerospaceWorkspace } from './AerospacePanel'

const WS: AerospaceWorkspace[] = [
  { name: '1', focused: false, empty: false },
  { name: '2', focused: true, empty: false },
  { name: '3', focused: false, empty: true },
  { name: '4', focused: false, empty: true },
]

const noop = () => {}

export const aerospacePanelStories = defineStories('AerospacePanel (app)', [
  {
    name: 'workspaces + actions',
    keys: '↑↓ move · ⏎ run · 1-9 workspace · esc back',
    render: () => (
      <AerospacePanel
        workspaces={WS}
        installed
        onAction={noop}
        onClose={noop}
      />
    ),
  },
  {
    name: 'tiling paused (nothing focused)',
    render: () => (
      <AerospacePanel
        workspaces={WS.map((w) => ({ ...w, focused: false }))}
        installed
        onAction={noop}
        onClose={noop}
      />
    ),
  },
  {
    name: 'not installed',
    render: () => (
      <AerospacePanel
        workspaces={[]}
        installed={false}
        onAction={noop}
        onClose={noop}
      />
    ),
  },
  {
    name: 'loading',
    render: () => (
      <AerospacePanel
        workspaces={null}
        installed
        onAction={noop}
        onClose={noop}
      />
    ),
  },
])
