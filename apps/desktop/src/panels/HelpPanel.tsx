/**
 * Help panel, presentational half: the command reference (Omarchy keybindings
 * screen). Sections of `left → right` rows, live-filtered by a prompt. Pure
 * props + @launcharr/tui + the pure core matcher — no tauri imports.
 */
import { fuzzyMatch } from '@launcharr/core/matcher'
import {
  HotkeyRow,
  Panel,
  SectionHeader,
  TextPrompt,
  useListNav,
} from '@launcharr/tui'
import { CircleHelp } from 'lucide-react'
import { useMemo, useState } from 'react'

export interface HelpEntry {
  /** The thing you type or press. */
  left: string
  /** What it does. */
  right: string
}

export interface HelpSection {
  label: string
  entries: HelpEntry[]
}

export interface HelpPanelProps {
  sections: HelpSection[]
  onClose: () => void
}

export function HelpPanel({ sections, onClose }: HelpPanelProps) {
  const [filter, setFilter] = useState('')

  const visible = useMemo(() => {
    const query = filter.trim()
    if (!query) return sections
    return sections
      .map((s) => ({
        label: s.label,
        entries: s.entries.filter(
          (e) => fuzzyMatch(query, `${e.left} ${e.right}`) !== null,
        ),
      }))
      .filter((s) => s.entries.length > 0)
  }, [sections, filter])

  const flatCount = visible.reduce((n, s) => n + s.entries.length, 0)
  const nav = useListNav(flatCount, {
    onBack: () => (filter ? setFilter('') : onClose()),
  })

  let cursor = 0
  return (
    <Panel
      icon={<CircleHelp size={17} strokeWidth={2} aria-hidden />}
      title="Help"
      subtitle="everything launcharr answers to"
    >
      <TextPrompt
        autoFocus
        value={filter}
        onChange={(v) => {
          setFilter(v)
          nav.setIndex(0)
        }}
        placeholder="Filter commands…"
        onKeyDown={nav.onKeyDown}
      />
      <div className="tui-scroll">
        {visible.length === 0 && (
          <HotkeyRow keys={filter.trim()} action="no matches" />
        )}
        {visible.map((section) => (
          <div key={section.label}>
            <SectionHeader label={section.label} />
            {section.entries.map((e) => {
              const index = cursor++
              return (
                <div
                  key={`${section.label}-${e.left}-${e.right}`}
                  onMouseMove={() => nav.setIndex(index)}
                  // Selection must never leave the visible clip (the wifi
                  // panel's first field bug — see ListRow).
                  ref={
                    index === nav.index
                      ? (el) => el?.scrollIntoView({ block: 'nearest' })
                      : null
                  }
                >
                  <HotkeyRow
                    keys={e.left}
                    action={e.right}
                    selected={index === nav.index}
                  />
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </Panel>
  )
}
