/**
 * Screenshots panel, presentational half (plans/done/screenshots-panel.md):
 * search prompt + a newest-first thumbnail grid. The first grid and the first
 * scrolling surface in the app — a screenshot is found by recency, not by name,
 * so "8 rows and narrow" doesn't fit; ↓ past the bottom (or scrolling there)
 * loads another page. Pure props + @launcharr/tui; the container owns invokes.
 */
import {
  KeyHints,
  ListRow,
  Panel,
  TextPrompt,
  ThumbCell,
  ThumbGrid,
  useGridNav,
} from '@launcharr/tui'
import { Camera } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import {
  type Screenshot,
  filterScreenshots,
  relativeAge,
} from '../lib/screenshots'

export const GRID_COLS = 4
export const PAGE_SIZE = 24

export interface ScreenshotsPanelProps {
  shots: Screenshot[]
  /** Folder shown in the header, `~`-abbreviated by the container. */
  folder: string
  /** Thumbnail URL per path; missing = still generating (placeholder). */
  thumbs: Record<string, string>
  /** Ask for a thumbnail — called for mounted cells only, so paging is lazy. */
  onNeedThumb: (path: string) => void
  onCopy: (path: string) => void
  onReveal: (path: string) => void
  onOpen: (path: string) => void
  onClose: () => void
  error: string | null
  /** Unix ms "now", injected so stories render deterministic ages. */
  nowMs?: number
}

export function ScreenshotsPanel({
  shots,
  folder,
  thumbs,
  onNeedThumb,
  onCopy,
  onReveal,
  onOpen,
  onClose,
  error,
  nowMs,
}: ScreenshotsPanelProps) {
  const [filter, setFilter] = useState('')
  const [shown, setShown] = useState(PAGE_SIZE)
  const now = nowMs ?? Date.now()

  const matched = useMemo(
    () => filterScreenshots(shots, filter),
    [shots, filter],
  )
  const visible = matched.slice(0, shown)
  const more = matched.length - visible.length
  const loadMore = () => setShown((n) => n + PAGE_SIZE)

  const act = (i: number, e?: { metaKey: boolean; shiftKey: boolean }) => {
    const shot = visible[i]
    if (!shot) return
    if (e?.metaKey && e.shiftKey) onOpen(shot.path)
    else if (e?.metaKey) onReveal(shot.path)
    else onCopy(shot.path)
  }

  const nav = useGridNav(visible.length, GRID_COLS, {
    onActivate: (i, e) => act(i, e),
    onBack: () => (filter ? setFilter('') : onClose()),
    onBottom: () => more > 0 && loadMore(),
  })

  // Mouse-scroll path to the same "load more": a sentinel after the grid.
  const sentinel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = sentinel.current
    if (!el || more <= 0) return
    const io = new IntersectionObserver((entries) => {
      if (entries.some((en) => en.isIntersecting)) loadMore()
    })
    io.observe(el)
    return () => io.disconnect()
  }, [more, visible.length])

  return (
    <Panel
      icon={<Camera size={17} strokeWidth={2} aria-hidden />}
      title="Screenshots"
      subtitle={`${shots.length} in ${folder}`}
      footer={
        <KeyHints
          hints={[
            { keys: '←↑↓→', label: 'move' },
            { keys: '↵', label: 'copy file' },
            { keys: '⌘↵', label: 'reveal' },
            { keys: '⌘⇧↵', label: 'open' },
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
          setShown(PAGE_SIZE)
          nav.setIndex(0)
        }}
        placeholder="Filter screenshots…"
        onKeyDown={nav.onKeyDown}
      />
      {error && <ListRow icon="✕" label={error} right="" dim />}
      {visible.length === 0 ? (
        <ListRow
          dim
          label={shots.length === 0 ? 'no screenshots yet' : 'no matches'}
        />
      ) : (
        <ThumbGrid cols={GRID_COLS}>
          {visible.map((shot, i) => (
            <Thumb
              key={shot.path}
              shot={shot}
              src={thumbs[shot.path] ?? null}
              age={relativeAge(shot.mtimeMs, now)}
              selected={i === nav.index}
              onNeedThumb={onNeedThumb}
              onClick={() => act(i)}
              onHover={() => nav.setIndex(i)}
            />
          ))}
        </ThumbGrid>
      )}
      {more > 0 && (
        <div ref={sentinel}>
          <ListRow dim label={`↓ ${more} more`} onClick={loadMore} />
        </div>
      )}
    </Panel>
  )
}

function Thumb({
  shot,
  src,
  age,
  selected,
  onNeedThumb,
  onClick,
  onHover,
}: {
  shot: Screenshot
  src: string | null
  age: string
  selected: boolean
  onNeedThumb: (path: string) => void
  onClick: () => void
  onHover: () => void
}) {
  useEffect(() => {
    if (!src) onNeedThumb(shot.path)
  }, [src, shot.path, onNeedThumb])
  return (
    <ThumbCell
      src={src}
      label={shot.name.replace(/\.[^.]+$/, '')}
      sub={age}
      selected={selected}
      onClick={onClick}
      onHover={onHover}
    />
  )
}
