import type { IndexItem, ScriptInfo } from '@launcharr/core/types'
import { invoke } from '@tauri-apps/api/core'
import { useEffect, useMemo, useState } from 'react'

import type { Config } from '../lib/config'
import { HelpPanel, type HelpSection } from './HelpPanel'
import { PANEL_INFO, panelEnabled } from './registry'

/** One fetch on open — the reference doesn't change under you. */
export function HelpPanelContainer({ onClose }: { onClose: () => void }) {
  const [config, setConfig] = useState<Config | null>(null)
  const [index, setIndex] = useState<IndexItem[]>([])
  const [scripts, setScripts] = useState<ScriptInfo[]>([])

  useEffect(() => {
    invoke<Config>('read_config').then(setConfig).catch(console.error)
    invoke<IndexItem[]>('get_index').then(setIndex).catch(console.error)
    invoke<ScriptInfo[]>('get_scripts').then(setScripts).catch(console.error)
  }, [])

  const sections = useMemo(
    () => buildSections(config, index, scripts),
    [config, index, scripts],
  )
  return <HelpPanel sections={sections} onClose={onClose} />
}

export function buildSections(
  config: Config | null,
  index: IndexItem[],
  scripts: ScriptInfo[],
): HelpSection[] {
  const sections: HelpSection[] = []

  sections.push({
    label: 'Modes',
    entries: [
      {
        left: config?.sigil ?? '❯',
        right: 'type to launch — apps, panes, quicklinks, math, URLs',
      },
      { left: '!', right: `run command in ${config?.terminal ?? 'terminal'}` },
      { left: ':', right: 'emoji picker' },
      {
        left: '?',
        right: config?.agents.askMode
          ? `ask ${config.agents.askProvider}`
          : 'ask an agent (off — Settings → Agents)',
      },
    ],
  })

  sections.push({
    label: 'Keys',
    entries: [
      { left: config?.hotkey ?? 'Alt+Space', right: 'summon / dismiss' },
      { left: 'esc', right: 'back — mode, panel, then dismiss' },
      { left: '↑ ↓ · ^n ^p', right: 'move selection' },
      { left: '⏎', right: 'open selection' },
      { left: '⌥⏎', right: 'alt action — reveal app, copy URL, delete clip' },
      { left: '⌘1…8', right: 'open nth result' },
    ],
  })

  sections.push({
    label: 'Panels',
    entries: PANEL_INFO.filter(
      (p) => !config || panelEnabled(p.id, config),
    ).map((p) => ({
      left: p.id,
      right: `${p.title} — ${p.hint.replace(/ ▸$/, '')}`,
    })),
  })

  const keyword = (item: IndexItem) =>
    item.aliases[0] ?? item.name.toLowerCase()
  const commands = index
    .filter((i) => i.kind === 'command')
    .map((i) => ({ left: keyword(i), right: i.name }))
  const builtins = index
    .filter((i) => i.kind === 'launcharr')
    .map((i) => ({ left: keyword(i), right: i.name }))
  if (commands.length + builtins.length > 0) {
    sections.push({ label: 'Commands', entries: [...commands, ...builtins] })
  }

  if (scripts.length > 0) {
    sections.push({
      label: 'Scripts',
      entries: scripts.map((s) => ({
        left: s.trigger,
        right: s.description ? `${s.name} — ${s.description}` : s.name,
      })),
    })
  }

  sections.push({
    label: 'Clipboard & text',
    entries: [
      { left: 'clip', right: 'search clipboard history inline' },
      { left: 'clip clear', right: 'wipe clipboard history' },
      {
        left: 'lorem',
        right: 'placeholder text — title, sentences, paragraphs; ⏎ copies',
      },
      {
        left: 'colorpicker',
        right: 'sample any pixel with the loupe; ⏎ copies #RRGGBB',
      },
    ],
  })

  const quicklinks = (config?.links ?? []).filter(
    (l) => l.trigger && l.url.includes('{query}'),
  )
  if (quicklinks.length > 0) {
    sections.push({
      label: 'Quicklinks',
      entries: quicklinks.map((l) => ({
        left: l.trigger as string,
        right: l.name,
      })),
    })
  }

  return sections
}
