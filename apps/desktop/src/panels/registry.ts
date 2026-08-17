import { normalizeDesktop } from '@launcharr/core/desktop'
import {
  Bot,
  CircleHelp,
  ClipboardList,
  Coffee,
  Gauge,
  Globe,
  LayoutGrid,
  type LucideIcon,
  Volume2,
  Wifi,
} from 'lucide-react'

import type { Config } from '../lib/config'

/**
 * Pure panel metadata, split from the component map in App.tsx so panels that
 * list panels (help) and the fuzzy keyword items can read it without importing
 * the app shell. Adding a tenant: one entry here + its component in App.tsx.
 */
export interface PanelInfo {
  id: string
  title: string
  hint: string
  /** Extra fuzzy-match words beyond the id (the deleted caffeinate slugs'
   * muscle memory lands on the awake panel through these). */
  aliases?: string[]
}

export const PANEL_INFO: PanelInfo[] = [
  { id: 'agents', title: 'Agents', hint: 'coding agent sessions ▸' },
  { id: 'usage', title: 'Usage', hint: 'token monitor ▸' },
  {
    id: 'awake',
    title: 'Awake',
    hint: 'keep-alive sessions ▸',
    aliases: ['caffeine', 'caffeinate', 'keep-awake', 'stay-awake'],
  },
  { id: 'wifi', title: 'Wi-Fi', hint: 'networks & power ▸' },
  { id: 'dns', title: 'DNS', hint: 'network info ▸' },
  { id: 'audio', title: 'Audio', hint: 'volume & devices ▸' },
  { id: 'clipboard', title: 'Clipboard', hint: 'history & search ▸' },
  {
    id: 'aerospace',
    title: 'AeroSpace',
    hint: 'workspaces & tiling ▸',
    aliases: ['aero', 'tiling', 'workspace'],
  },
  { id: 'help', title: 'Help', hint: 'commands & keys ▸' },
]

/** Lucide icon per panel — launcher rows and panel headers share it. */
export const PANEL_ICONS: Record<string, LucideIcon> = {
  agents: Bot,
  usage: Gauge,
  awake: Coffee,
  wifi: Wifi,
  dns: Globe,
  audio: Volume2,
  clipboard: ClipboardList,
  help: CircleHelp,
  aerospace: LayoutGrid,
}

/** Panels gated by settings; anything unlisted is always on. */
export function panelEnabled(id: string, config: Config): boolean {
  if (id === 'usage') return config.agents.usage
  if (id === 'agents') return config.agents.monitor
  if (id === 'aerospace') return normalizeDesktop(config.desktop).tiling.enabled
  return true
}
