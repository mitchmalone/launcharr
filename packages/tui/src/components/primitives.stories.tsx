import { useState } from 'react'

import { useListNav } from '../hooks'
import { defineStories } from '../story'
import {
  Divider,
  HotkeyRow,
  KeyHints,
  ListRow,
  Panel,
  SectionHeader,
  TextPrompt,
  TwoPane,
} from './primitives'

function NavigableList() {
  const items = ['Package', 'Web App', 'TUI', 'Style', 'Service']
  const nav = useListNav(items.length)
  return (
    <Panel title="Keyboard list" onKeyDown={nav.onKeyDown}>
      {items.map((item, i) => (
        <ListRow
          key={item}
          label={item}
          selected={i === nav.index}
          onHover={() => nav.setIndex(i)}
        />
      ))}
    </Panel>
  )
}

function PromptStory() {
  const [value, setValue] = useState('')
  return (
    <Panel>
      <TextPrompt
        value={value}
        onChange={setValue}
        placeholder="Search clipboard…"
        sigil=">"
      />
    </Panel>
  )
}

export const listRowStories = defineStories('ListRow', [
  {
    name: 'default',
    render: () => (
      <Panel>
        <ListRow icon="◠" label="Gateway_F7880B" right="⚿" />
      </Panel>
    ),
  },
  {
    name: 'selected, not hovered',
    notes:
      'THE state the 2026-08-16 CSS specificity bug hid — must be visibly distinct with the mouse nowhere near it.',
    render: () => (
      <Panel>
        <ListRow label="Above" />
        <ListRow selected icon="◠" label="RamenAmok" right="connected" />
        <ListRow label="Below" />
      </Panel>
    ),
  },
  {
    name: 'dim / disabled',
    render: () => (
      <Panel>
        <ListRow dim label="Scan for networks…" sub="needs Location Services" />
      </Panel>
    ),
  },
  {
    name: 'overflow',
    notes: 'Long labels ellipsize; the right slot never wraps.',
    render: () => (
      <Panel>
        <ListRow
          icon="▸"
          label="An extremely long network name that keeps going well past any reasonable width and then some"
          right="⚿ 100%"
        />
      </Panel>
    ),
  },
  {
    name: 'with sub line',
    render: () => (
      <Panel>
        <ListRow icon="◠" label="Cinque" sub="Connected · 6 GHz" right="↑" />
      </Panel>
    ),
  },
])

export const panelStories = defineStories('Panel', [
  {
    name: 'title + subtitle + icon + footer',
    render: () => (
      <Panel icon="◀" title="Audio" subtitle="Easy listening" footer="footer">
        body content
      </Panel>
    ),
  },
  {
    name: 'bare',
    render: () => <Panel>just a body</Panel>,
  },
  {
    name: 'keyboard list (live)',
    keys: '↑↓ move · home/end jump',
    render: () => <NavigableList />,
  },
  {
    name: 'empty body',
    render: () => (
      <Panel title="Nothing here">
        <ListRow dim label="nothing on the horizon" />
      </Panel>
    ),
  },
])

export const hotkeyStories = defineStories('HotkeyRow', [
  {
    name: 'rows + selected (not hovered)',
    render: () => (
      <Panel title="Keybindings">
        <HotkeyRow keys="SUPER + K" action="Keybindings" />
        <HotkeyRow keys="SUPER + RETURN" action="Terminal" selected />
        <HotkeyRow keys="SUPER CTRL + V" action="Clipboard manager" />
      </Panel>
    ),
  },
  {
    name: 'overflow',
    render: () => (
      <Panel>
        <HotkeyRow
          keys="SUPER SHIFT CTRL ALT + BACKSPACE"
          action="An action label much longer than any sane binding deserves"
        />
      </Panel>
    ),
  },
])

export const chromeStories = defineStories('Section / Hints / Divider', [
  {
    name: 'section headers',
    render: () => (
      <Panel>
        <SectionHeader label="Output" right="30%" />
        <SectionHeader label="No right slot" />
        <Divider />
        <SectionHeader label="Below a divider" />
      </Panel>
    ),
  },
  {
    name: 'key hints',
    render: () => (
      <Panel>
        <KeyHints
          hints={[
            { keys: '↔', label: 'toggle' },
            { keys: 'enter', label: 'submit' },
            { keys: 'y', label: 'Yes' },
            { keys: 'n', label: 'No' },
          ]}
        />
      </Panel>
    ),
  },
])

export const promptStories = defineStories('TextPrompt', [
  {
    name: 'empty with placeholder + sigil',
    keys: 'type · esc clears upstream',
    render: () => <PromptStory />,
  },
])

export const twoPaneStories = defineStories('TwoPane', [
  {
    name: 'list + preview',
    render: () => (
      <Panel>
        <TwoPane
          left={
            <>
              <ListRow label="Fast.com" selected />
              <ListRow label="Screenshot from Friday 14:40" />
              <ListRow label="5120×2880" />
            </>
          }
          right={<div style={{ padding: 9 }}>Fast.com</div>}
        />
      </Panel>
    ),
  },
  {
    name: 'empty right pane',
    render: () => (
      <Panel>
        <TwoPane left={<ListRow dim label="no results" />} right={null} />
      </Panel>
    ),
  },
])
