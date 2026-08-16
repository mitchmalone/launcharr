import { PANEL_INFO } from './demo-data'

export type ItemKind = 'app' | 'settings' | 'command' | 'link' | 'panel'

export type IndexItem = {
  id: string
  kind: ItemKind
  name: string
  hint: string
  aliases: string[]
  /** Mock app icon (emoji) shown in the results list. */
  icon?: string
  /** Panel items carry their trigger word here, as the engine expects. */
  path?: string
}

export type Quicklink = {
  trigger: string
  name: string
  url: string
}

export const INDEX: IndexItem[] = [
  {
    id: 'app:ghostty',
    icon: '👻',
    kind: 'app',
    name: 'Ghostty',
    hint: 'app',
    aliases: ['terminal'],
  },
  {
    id: 'app:code',
    icon: '🧑‍💻',
    kind: 'app',
    name: 'Visual Studio Code',
    hint: 'app',
    aliases: ['vscode', 'editor'],
  },
  {
    id: 'app:linear',
    icon: '📐',
    kind: 'app',
    name: 'Linear',
    hint: 'app',
    aliases: ['issues'],
  },
  {
    id: 'app:figma',
    icon: '🎨',
    kind: 'app',
    name: 'Figma',
    hint: 'app',
    aliases: ['design'],
  },
  {
    id: 'app:notes',
    icon: '📝',
    kind: 'app',
    name: 'Notes',
    hint: 'app',
    aliases: [],
  },
  {
    id: 'app:music',
    icon: '🎵',
    kind: 'app',
    name: 'Music',
    hint: 'app',
    aliases: [],
  },
  {
    id: 'app:mail',
    icon: '✉️',
    kind: 'app',
    name: 'Mail',
    hint: 'app',
    aliases: [],
  },
  {
    id: 'app:safari',
    icon: '🧭',
    kind: 'app',
    name: 'Safari',
    hint: 'app',
    aliases: ['browser'],
  },
  {
    id: 'app:arc',
    icon: '🌈',
    kind: 'app',
    name: 'Arc',
    hint: 'app',
    aliases: ['browser'],
  },
  {
    id: 'app:slack',
    icon: '💬',
    kind: 'app',
    name: 'Slack',
    hint: 'app',
    aliases: [],
  },
  {
    id: 'app:messages',
    icon: '🗨️',
    kind: 'app',
    name: 'Messages',
    hint: 'app',
    aliases: ['imessage', 'texts'],
  },
  {
    id: 'app:spotify',
    icon: '🎧',
    kind: 'app',
    name: 'Spotify',
    hint: 'app',
    aliases: [],
  },
  {
    id: 'app:photoshop',
    icon: '🖌️',
    kind: 'app',
    name: 'Adobe Photoshop',
    hint: 'app',
    aliases: ['ps'],
  },
  {
    id: 'app:xcode',
    icon: '🔨',
    kind: 'app',
    name: 'Xcode',
    hint: 'app',
    aliases: [],
  },
  {
    id: 'app:obsidian',
    icon: '💎',
    kind: 'app',
    name: 'Obsidian',
    hint: 'app',
    aliases: ['notes', 'vault'],
  },
  {
    id: 'app:notion',
    icon: '🗂️',
    kind: 'app',
    name: 'Notion',
    hint: 'app',
    aliases: [],
  },
  {
    id: 'app:1password',
    icon: '🔐',
    kind: 'app',
    name: '1Password',
    hint: 'app',
    aliases: ['passwords', 'vault'],
  },
  {
    id: 'app:finder',
    icon: '💠',
    kind: 'app',
    name: 'Finder',
    hint: 'app',
    aliases: ['files'],
  },
  {
    id: 'app:photos',
    icon: '🌅',
    kind: 'app',
    name: 'Photos',
    hint: 'app',
    aliases: [],
  },
  {
    id: 'app:reminders',
    icon: '✅',
    kind: 'app',
    name: 'Reminders',
    hint: 'app',
    aliases: ['todo'],
  },
  {
    id: 'app:raycast',
    icon: '🚀',
    kind: 'app',
    name: 'Raycast',
    hint: 'app',
    aliases: ['the competition'],
  },
  {
    id: 'app:activity',
    icon: '📈',
    kind: 'app',
    name: 'Activity Monitor',
    hint: 'app',
    aliases: ['processes'],
  },
  {
    id: 'app:preview',
    icon: '🖼️',
    kind: 'app',
    name: 'Preview',
    hint: 'app',
    aliases: [],
  },
  {
    id: 'app:calendar',
    icon: '📆',
    kind: 'app',
    name: 'Calendar',
    hint: 'app',
    aliases: [],
  },
  {
    id: 'settings:displays',
    kind: 'settings',
    name: 'Displays',
    hint: 'system settings',
    aliases: ['monitor', 'resolution'],
  },
  {
    id: 'settings:network',
    kind: 'settings',
    name: 'Network',
    hint: 'system settings',
    aliases: ['wifi'],
  },
  {
    id: 'settings:keyboard',
    kind: 'settings',
    name: 'Keyboard',
    hint: 'system settings',
    aliases: ['shortcuts'],
  },
  {
    id: 'cmd:sleep-displays',
    kind: 'command',
    name: 'Sleep displays',
    hint: 'system command',
    aliases: ['screen off'],
  },
  {
    id: 'cmd:lock',
    kind: 'command',
    name: 'Lock screen',
    hint: 'system command',
    aliases: [],
  },
  {
    id: 'cmd:dark',
    kind: 'command',
    name: 'Toggle dark mode',
    hint: 'system command',
    aliases: ['appearance'],
  },
  {
    id: 'cmd:trash',
    kind: 'command',
    name: 'Empty trash',
    hint: 'system command',
    aliases: [],
  },
  {
    id: 'settings:sound',
    kind: 'settings',
    name: 'Sound',
    hint: 'system settings',
    aliases: ['volume', 'output'],
  },
  {
    id: 'settings:bluetooth',
    kind: 'settings',
    name: 'Bluetooth',
    hint: 'system settings',
    aliases: ['airpods'],
  },
  {
    id: 'settings:battery',
    kind: 'settings',
    name: 'Battery',
    hint: 'system settings',
    aliases: ['power', 'energy'],
  },
  {
    id: 'settings:wallpaper',
    kind: 'settings',
    name: 'Wallpaper',
    hint: 'system settings',
    aliases: ['desktop'],
  },
  {
    id: 'cmd:screenshot',
    kind: 'command',
    name: 'Capture screenshot',
    hint: 'system command',
    aliases: ['screen shot', 'grab'],
  },
  {
    id: 'cmd:caffeinate',
    kind: 'command',
    name: 'Keep Mac awake',
    hint: 'system command',
    aliases: ['caffeinate', 'no sleep'],
  },
  {
    id: 'cmd:show-desktop',
    kind: 'command',
    name: 'Show desktop',
    hint: 'system command',
    aliases: [],
  },
  {
    id: 'link:launcharr',
    kind: 'link',
    name: 'launcharr on GitHub',
    hint: 'quicklink',
    aliases: ['repo'],
  },
  /* Panel triggers are rankable items so they fuzzy-match like apps, exactly as
     the app indexes them; typing the exact word still goes through the grammar's
     trigger mode. `path` carries the trigger word (core/types.ts). */
  ...PANEL_INFO.map((p) => ({
    id: `panel:${p.id}`,
    kind: 'panel' as const,
    name: p.title,
    hint: p.hint,
    path: p.id,
    aliases: [p.id],
  })),
]

export const SEED_FRECENCY: Record<string, number> = {
  'app:ghostty': 12,
  'app:code': 9,
  'app:linear': 5,
  'cmd:lock': 3,
  'app:notes': 2,
}

export const QUICKLINKS: Quicklink[] = [
  {
    trigger: 'yt',
    name: 'YouTube',
    url: 'https://youtube.com/results?search_query={query}',
  },
  {
    trigger: 'gh',
    name: 'GitHub',
    url: 'https://github.com/search?q={query}',
  },
  {
    trigger: 'wiki',
    name: 'Wikipedia',
    url: 'https://en.wikipedia.org/wiki/Special:Search?search={query}',
  },
  {
    trigger: 'chill',
    name: 'Chill Institute',
    url: 'https://chill.institute/search?q={query}',
  },
]

export const TRIGGERS: ReadonlySet<string> = new Set([
  ...QUICKLINKS.map((l) => l.trigger),
  ...PANEL_INFO.map((p) => p.id),
])
