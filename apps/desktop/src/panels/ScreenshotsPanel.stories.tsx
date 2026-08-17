import { defineStories } from '@launcharr/tui'

import type { Screenshot } from '../lib/screenshots'
import { ScreenshotsPanel } from './ScreenshotsPanel'

const NOW = 1_755_400_000_000
const SHOTS: Screenshot[] = Array.from({ length: 30 }, (_, i) => ({
  path: `/Users/m/Desktop/Screenshot 2026-08-17 at 11.${String(53 - i).padStart(2, '0')}.23.png`,
  name: `Screenshot 2026-08-17 at 11.${String(53 - i).padStart(2, '0')}.23.png`,
  mtimeMs: NOW - i * 7 * 60_000,
}))

const noop = () => {}
const base = {
  folder: '~/Desktop',
  onNeedThumb: noop,
  onCopy: noop,
  onReveal: noop,
  onOpen: noop,
  onClose: noop,
  error: null,
  nowMs: NOW,
}

export const screenshotsPanelStories = defineStories('ScreenshotsPanel (app)', [
  {
    name: 'grid, thumbnails pending',
    keys: '←↑↓→ move · ↵ copy · ⌘↵ reveal · ⌘⇧↵ open · esc back',
    render: () => <ScreenshotsPanel {...base} shots={SHOTS} thumbs={{}} />,
  },
  {
    name: 'empty folder',
    render: () => <ScreenshotsPanel {...base} shots={[]} thumbs={{}} />,
  },
])
