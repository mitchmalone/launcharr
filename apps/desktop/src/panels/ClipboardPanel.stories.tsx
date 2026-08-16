import type { Clip } from '@launcharr/core/types'
import { defineStories } from '@launcharr/tui'

import { ClipboardPanel } from './ClipboardPanel'

const NOW = 1_755_300_000
const CLIPS: Clip[] = [
  { id: 9, content: 'Fast.com', ts: NOW - 120 },
  {
    id: 8,
    content:
      'export PATH="/opt/homebrew/opt/rustup/bin:$PATH"\ncargo clippy --all-targets -- -D warnings',
    ts: NOW - 600,
  },
  { id: 7, content: 'z', ts: NOW - 900 },
  { id: 6, content: 'H', ts: NOW - 1800 },
  {
    id: 5,
    content:
      'A much longer clip that goes on and on — the row shows only its first line, truncated at seventy characters, while the preview pane on the right renders the whole thing with wrapping.\n\nSecond paragraph included.',
    ts: NOW - 3600,
  },
  { id: 4, content: '144', ts: NOW - 7200 },
  { id: 3, content: '5120×2880', ts: NOW - 86_400 },
]

const noop = () => {}
const base = { error: null, onCopy: noop, onDelete: noop, onClose: noop }

export const clipboardPanelStories = defineStories('ClipboardPanel (app)', [
  {
    name: 'history + preview',
    keys: '↑↓ move · ↵ copy · ⌘⌫ delete · esc back',
    render: () => <ClipboardPanel {...base} clips={CLIPS} />,
  },
  {
    name: 'empty history',
    render: () => <ClipboardPanel {...base} clips={[]} />,
  },
  {
    name: 'delete failed',
    render: () => (
      <ClipboardPanel {...base} clips={CLIPS} error="db is locked" />
    ),
  },
])
