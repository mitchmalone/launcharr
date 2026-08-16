import {
  Bot,
  CircleHelp,
  ClipboardList,
  Gauge,
  Globe,
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
}

export const PANEL_INFO: PanelInfo[] = [
  { id: 'agents', title: 'Agents', hint: 'coding agent sessions ▸' },
  { id: 'usage', title: 'Usage', hint: 'token monitor ▸' },
  { id: 'wifi', title: 'Wi-Fi', hint: 'networks & power ▸' },
  { id: 'dns', title: 'DNS', hint: 'network info ▸' },
  { id: 'audio', title: 'Audio', hint: 'volume & devices ▸' },
  { id: 'clipboard', title: 'Clipboard', hint: 'history & search ▸' },
  { id: 'help', title: 'Help', hint: 'commands & keys ▸' },
]

/** Lucide icon per panel — launcher rows and panel headers share it. */
export const PANEL_ICONS: Record<string, LucideIcon> = {
  agents: Bot,
  usage: Gauge,
  wifi: Wifi,
  dns: Globe,
  audio: Volume2,
  clipboard: ClipboardList,
  help: CircleHelp,
}

/** Panels gated by settings; anything unlisted is always on. */
export function panelEnabled(id: string, config: Config): boolean {
  if (id === 'usage') return config.agents.usage
  if (id === 'agents') return config.agents.monitor
  return true
}
