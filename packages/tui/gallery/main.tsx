import {
  Calendar,
  Divider,
  HotkeyRow,
  KeyHints,
  ListRow,
  type MenuNode,
  MeterRow,
  Panel,
  SectionHeader,
  SegmentedControl,
  Slider,
  TextPrompt,
  Toggle,
  TwoPane,
  drillIn,
  drillOut,
  nodesAtPath,
  stepMonth,
  useListNav,
  yearProgress,
} from '@launcharr/tui'
import '@launcharr/tui/styles.css'
import { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'

import './gallery.css'

/* ---- Install-style drill-down menu ---------------------------------- */

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
      { id: 'background', label: 'Background' },
    ],
  },
  {
    id: 'service',
    label: 'Service',
    icon: '◇',
    children: [
      { id: 'agent', label: 'Agent status' },
      { id: 'tmux', label: 'Tmux watcher' },
    ],
  },
  { id: 'editor', label: 'Editor', icon: '▤' },
]

function MenuDemo() {
  const [path, setPath] = useState<string[]>([])
  const nodes = nodesAtPath(INSTALL_MENU, path) ?? INSTALL_MENU
  const nav = useListNav(nodes.length, {
    onActivate: (i) => {
      const next = drillIn(INSTALL_MENU, path, nodes[i]!.id)
      if (next) setPath(next)
    },
    onDrillIn: (i) => {
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
          onClick={() => {
            const next = drillIn(INSTALL_MENU, path, node.id)
            if (next) setPath(next)
          }}
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

/* ---- Hotkeys --------------------------------------------------------- */

const HOTKEYS = [
  { keys: 'SUPER + K', action: 'Keybindings' },
  { keys: 'SUPER SHIFT + RETURN', action: 'Browser' },
  { keys: 'SUPER CTRL + V', action: 'Clipboard manager' },
  { keys: 'SUPER CTRL + TAB', action: 'Former workspace' },
  { keys: 'SUPER + TAB', action: 'Next workspace' },
]

function HotkeysDemo() {
  const nav = useListNav(HOTKEYS.length)
  return (
    <Panel title="Keybindings" onKeyDown={nav.onKeyDown}>
      {HOTKEYS.map((h, i) => (
        <HotkeyRow
          key={h.keys}
          keys={h.keys}
          action={h.action}
          selected={i === nav.index}
        />
      ))}
    </Panel>
  )
}

/* ---- Audio ----------------------------------------------------------- */

function AudioDemo() {
  const [enabled, setEnabled] = useState(true)
  const [output, setOutput] = useState(30)
  const [input, setInput] = useState(80)
  const [device, setDevice] = useState('LSX II LT')
  const devices = ['Laptop Speakers', 'Shure MV7+', 'LSX II LT']
  return (
    <Panel
      icon="◀"
      title="Audio"
      subtitle="Easy listening"
      footer={
        <Toggle checked={enabled} onChange={setEnabled} label="Audio enabled" />
      }
    >
      <SectionHeader label="Output" right={`${output}%`} />
      <Slider value={output} onChange={setOutput} step={5} label="Output" />
      {devices.map((d) => (
        <ListRow
          key={d}
          icon="▯"
          label={d}
          selected={d === device}
          onClick={() => setDevice(d)}
        />
      ))}
      <Divider />
      <SectionHeader label="Input" right={`${input}%`} />
      <Slider value={input} onChange={setInput} step={5} label="Input" />
      <MeterRow value={0.23} />
    </Panel>
  )
}

/* ---- Network --------------------------------------------------------- */

function NetworkDemo() {
  const [dns, setDns] = useState('cloudflare')
  return (
    <Panel icon="◠" title="Cinque" subtitle="Connected · 6 GHz">
      <div className="gallery-stats">
        <span>Ping</span>
        <b>17 ms</b>
        <span>Packet loss</span>
        <b>0%</b>
        <span>IP address</span>
        <b>192.168.0.199</b>
        <span>Gateway</span>
        <b>192.168.0.1</b>
      </div>
      <SectionHeader label="DNS provider" />
      <SegmentedControl
        value={dns}
        onChange={setDns}
        options={[
          { value: 'dhcp', label: 'DHCP' },
          { value: 'cloudflare', label: 'Cloudflare' },
          { value: 'google', label: 'Google' },
          { value: 'custom', label: 'Custom' },
        ]}
      />
      <SectionHeader label="Other networks" />
      <ListRow icon="◠" label="RUT241_4B56" right="⚿" />
      <ListRow icon="◠" label="Gateway_F7880B" />
      <ListRow icon="◠" label="W17_24" right="⚿" />
    </Panel>
  )
}

/* ---- Usage meters ---------------------------------------------------- */

function UsageDemo() {
  const [tool, setTool] = useState('claude')
  const days = [
    { label: 'Sat', value: 0 },
    { label: 'Sun', value: 0 },
    { label: 'Mon', value: 218.2 },
    { label: 'Tue', value: 12.4 },
    { label: 'Today', value: 96.1, emphasis: true },
  ]
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
      {days.map((d) => (
        <MeterRow
          key={d.label}
          label={d.label}
          value={d.value}
          max={220}
          right={d.value ? `${d.value}M` : '0'}
          emphasis={d.emphasis}
        />
      ))}
    </Panel>
  )
}

/* ---- Calendar -------------------------------------------------------- */

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
      <MeterRow label="LIFE" value={0.52} right="52%" />
      <Calendar
        year={view.year}
        month={view.month}
        selected={{
          year: today.getFullYear(),
          month: today.getMonth(),
          date: today.getDate(),
        }}
        onStep={(delta) => setView(stepMonth(view.year, view.month, delta))}
      />
    </Panel>
  )
}

/* ---- Clipboard two-pane ---------------------------------------------- */

const CLIPS = [
  'Fast.com',
  'Screenshot from Friday 14:40',
  'z',
  'H',
  '5120×2880',
]

function ClipboardDemo() {
  const [query, setQuery] = useState('')
  const items = CLIPS.filter((c) =>
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
        right={<div className="gallery-preview">{items[nav.index] ?? ''}</div>}
      />
    </Panel>
  )
}

/* ---- Wizard ---------------------------------------------------------- */

function WizardDemo() {
  const [url, setUrl] = useState('')
  return (
    <Panel title="launcharr" subtitle="Add a theme">
      <p className="gallery-copy">
        See https://launcharr.com/docs/themes for the format.
      </p>
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

function Gallery() {
  return (
    <div className="gallery">
      <h1>@launcharr/tui</h1>
      <div className="gallery-grid">
        <MenuDemo />
        <HotkeysDemo />
        <AudioDemo />
        <NetworkDemo />
        <UsageDemo />
        <CalendarDemo />
        <ClipboardDemo />
        <WizardDemo />
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Gallery />)
