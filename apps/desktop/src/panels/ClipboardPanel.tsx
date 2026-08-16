/**
 * Clipboard panel, presentational half (Omarchy clipboard manager): search
 * prompt + history list on the left, full-text preview on the right. Pure
 * props + @launcharr/tui + the pure core matcher — the container owns invokes.
 * Text clips only, like the underlying history (PRD §5.6).
 */
import { fuzzyMatch } from '@launcharr/core/matcher'
import { clipTitle } from '@launcharr/core/rows'
import type { Clip } from '@launcharr/core/types'
import {
  KeyHints,
  ListRow,
  Panel,
  TextPrompt,
  TwoPane,
  useListNav,
} from '@launcharr/tui'
import { useMemo, useState } from 'react'

export interface ClipboardPanelProps {
  clips: Clip[]
  error: string | null
  onCopy: (content: string) => void
  onDelete: (id: number) => void
  onClose: () => void
}

/** "Fri 14:40" — enough to tell clips apart, like the screenshots row labels. */
export function clipStamp(ts: number): string {
  const d = new Date(ts * 1000)
  const day = d.toLocaleDateString('en-AU', { weekday: 'short' })
  const hm = `${d.getHours().toString().padStart(2, '0')}:${d
    .getMinutes()
    .toString()
    .padStart(2, '0')}`
  return `${day} ${hm}`
}

export function ClipboardPanel({
  clips,
  error,
  onCopy,
  onDelete,
  onClose,
}: ClipboardPanelProps) {
  const [filter, setFilter] = useState('')

  const visible = useMemo(() => {
    const query = filter.trim()
    if (!query) return clips
    return clips
      .map((clip) => ({ clip, m: fuzzyMatch(query, clipTitle(clip.content)) }))
      .filter((x) => x.m !== null)
      .sort((a, b) => (b.m?.score ?? 0) - (a.m?.score ?? 0))
      .map((x) => x.clip)
  }, [clips, filter])

  const nav = useListNav(visible.length, {
    onActivate: (i) => {
      const clip = visible[i]
      if (clip) onCopy(clip.content)
    },
    onBack: () => (filter ? setFilter('') : onClose()),
  })
  const selected = nav.index >= 0 ? visible[nav.index] : undefined

  return (
    <Panel
      icon="⧉"
      title="Clipboard"
      subtitle={`${clips.length} item${clips.length === 1 ? '' : 's'}`}
      footer={
        <KeyHints
          hints={[
            { keys: '↑↓', label: 'move' },
            { keys: '↵', label: 'copy' },
            { keys: '⌘⌫', label: 'delete' },
            { keys: 'esc', label: 'back' },
          ]}
        />
      }
    >
      <TextPrompt
        autoFocus
        value={filter}
        onChange={(v) => {
          setFilter(v)
          nav.setIndex(0)
        }}
        placeholder="Search clipboard…"
        onKeyDown={(e) => {
          if (e.key === 'Backspace' && e.metaKey) {
            e.preventDefault()
            if (selected) onDelete(selected.id)
            return
          }
          nav.onKeyDown(e)
        }}
      />
      {error && <ListRow icon="✕" label={error} right="" dim />}
      <TwoPane
        left={
          visible.length === 0 ? (
            <ListRow
              dim
              label={
                clips.length === 0 ? 'clipboard history is empty' : 'no matches'
              }
            />
          ) : (
            visible.map((clip, i) => (
              <ListRow
                key={clip.id}
                label={clipTitle(clip.content)}
                selected={i === nav.index}
                right={clipStamp(clip.ts)}
                onClick={() => onCopy(clip.content)}
                onHover={() => nav.setIndex(i)}
              />
            ))
          )
        }
        right={
          selected ? (
            <pre className="tui-preview">{selected.content}</pre>
          ) : (
            <ListRow dim label="nothing selected" />
          )
        }
      />
    </Panel>
  )
}
