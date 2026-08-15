/** The original gallery screens, kept as composition stories: whole surfaces
 * assembled from the kit, mirroring the Omarchy reference screenshots. */
import { useMemo, useState } from 'react'

import { Calendar } from './components/calendar'
import {
  MeterRow,
  SegmentedControl,
  Slider,
  Toggle,
} from './components/controls'
import {
  Divider,
  HotkeyRow,
  KeyHints,
  ListRow,
  Panel,
  SectionHeader,
  TextPrompt,
  TwoPane,
} from './components/primitives'
import { useListNav } from './hooks'
import { stepMonth, yearProgress } from './nav/calendar'
import { type MenuNode, drillIn, drillOut, nodesAtPath } from './nav/menu'
import { defineStories } from './story'

const INSTALL_MENU: MenuNode[] = [
  { id: 'package', label: 'Package', icon: '' },
  { id: 'webapp', label: 'Web App', icon: '' },
  { id: 'tui', label: 'TUI', icon: '>_' },
  {
    id: 'style',
    label: 'Style',
    icon: '✦',
    children: [
      { id: 'theme', label: 'Theme' },
      { id: 'font', label: 'Font' },
    ],
  },
  {
    id: 'service',
    label: 'Service',
    icon: '◇',
    children: [{ id: 'agent', label: 'Agent status' }],
  },
]

function MenuDemo() {
  const [path, setPath] = useState<string[]>([])
  const nodes = nodesAtPath(INSTALL_MENU, path) ?? INSTALL_MENU
  const nav = useListNav(nodes.length, {
    onActivate: (i) => {
      const next = drillIn(INSTALL_MENU, path, nodes[i]!.id)
      if (next) setPath(next)
    },
    onBack: () => setPath(drillOut(path)),
    leftIsBack: true,
  })
  return (
    <Panel
      title={path.length ? path.join(' › ') : 'Install…'}
      onKeyDown={nav.onKeyDown}
    >
      {nodes.map((node, i) => (
        <ListRow
          key={node.id}
          selected={i === nav.index}
          icon={node.icon}
          label={node.label}
          right={node.children ? '›' : undefined}
          onHover={() => nav.setIndex(i)}
        />
      ))}
      <KeyHints
        hints={[
          { keys: '↑↓', label: 'move' },
          { keys: '↵', label: 'open' },
          { keys: 'esc', label: 'back' },
        ]}
      />
    </Panel>
  )
}

function AudioDemo() {
  const [enabled, setEnabled] = useState(true)
  const [output, setOutput] = useState(30)
  const [device, setDevice] = useState('LSX II LT')
  return (
    <Panel
      icon="◀"
      title="Audio"
      subtitle="Easy listening"
      footer={<Toggle checked={enabled} onChange={setEnabled} label="Audio" />}
    >
      <SectionHeader label="Output" right={`${output}%`} />
      <Slider value={output} onChange={setOutput} step={5} label="Output" />
      {['Laptop Speakers', 'Shure MV7+', 'LSX II LT'].map((d) => (
        <ListRow
          key={d}
          icon="▯"
          label={d}
          selected={d === device}
          onClick={() => setDevice(d)}
        />
      ))}
      <Divider />
      <MeterRow value={0.23} />
    </Panel>
  )
}

function UsageDemo() {
  const [tool, setTool] = useState('claude')
  return (
    <Panel icon="❋" title="Usage" subtitle="Prepaid">
      <SegmentedControl
        value={tool}
        onChange={setTool}
        options={[
          { value: 'claude', label: 'Claude Code' },
          { value: 'codex', label: 'Codex' },
          { value: 'fireworks', label: 'Fireworks' },
        ]}
      />
      <SectionHeader label="Tokens by day" />
      <MeterRow label="Mon" value={218.2} max={220} right="218.2M" />
      <MeterRow label="Tue" value={12.4} max={220} right="12.4M" />
      <MeterRow label="Today" value={96.1} max={220} right="96.1M" emphasis />
    </Panel>
  )
}

function CalendarDemo() {
  const today = useMemo(() => new Date(), [])
  const [view, setView] = useState({
    year: today.getFullYear(),
    month: today.getMonth(),
  })
  return (
    <Panel
      icon="▦"
      title={`${today.toLocaleString('en', { month: 'long' })} ${today.getDate()}`}
    >
      <MeterRow
        label={String(view.year)}
        value={yearProgress(today)}
        right={`${Math.round(yearProgress(today) * 100)}%`}
      />
      <Calendar
        year={view.year}
        month={view.month}
        selected={{
          year: today.getFullYear(),
          month: today.getMonth(),
          date: today.getDate(),
        }}
        onStep={(d) => setView(stepMonth(view.year, view.month, d))}
      />
    </Panel>
  )
}

function ClipboardDemo() {
  const [query, setQuery] = useState('')
  const clips = ['Fast.com', 'Screenshot from Friday 14:40', 'z', '5120×2880']
  const items = clips.filter((c) =>
    c.toLowerCase().includes(query.toLowerCase()),
  )
  const nav = useListNav(items.length)
  return (
    <Panel onKeyDown={nav.onKeyDown}>
      <TextPrompt
        value={query}
        onChange={setQuery}
        placeholder="Search clipboard…"
      />
      <TwoPane
        left={items.map((c, i) => (
          <ListRow
            key={c}
            label={c}
            selected={i === nav.index}
            onHover={() => nav.setIndex(i)}
          />
        ))}
        right={
          <div style={{ padding: '9px 12px' }}>{items[nav.index] ?? ''}</div>
        }
      />
    </Panel>
  )
}

function WizardDemo() {
  const [url, setUrl] = useState('')
  return (
    <Panel title="launcharr" subtitle="Add a theme">
      <TextPrompt
        sigil=">"
        value={url}
        onChange={setUrl}
        placeholder="Git repo URL (https or git@host:org/repo.git)"
      />
      <KeyHints hints={[{ keys: 'enter', label: 'submit' }]} />
    </Panel>
  )
}

export const compositionStories = defineStories('Compositions', [
  { name: 'install menu', keys: '↑↓ ↵ esc/←', render: () => <MenuDemo /> },
  {
    name: 'keybindings',
    render: () => (
      <Panel title="Keybindings">
        <HotkeyRow keys="SUPER + K" action="Keybindings" selected />
        <HotkeyRow keys="SUPER SHIFT + RETURN" action="Browser" />
        <HotkeyRow keys="SUPER CTRL + V" action="Clipboard manager" />
      </Panel>
    ),
  },
  { name: 'audio panel', render: () => <AudioDemo /> },
  { name: 'usage meters', render: () => <UsageDemo /> },
  { name: 'calendar', render: () => <CalendarDemo /> },
  { name: 'clipboard two-pane', render: () => <ClipboardDemo /> },
  { name: 'wizard prompt', render: () => <WizardDemo /> },
])
