import {
  BUILTIN_THEMES,
  KeyHints,
  ListRow,
  Panel,
  type StoryFile,
  applyTheme,
} from '@launcharr/tui'
import '@launcharr/tui/styles.css'
import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'

import './workbench.css'

/* Auto-discover story files from the kit and (later) app panels. */
const modules = {
  ...import.meta.glob('../src/**/*.stories.tsx', { eager: true }),
  ...import.meta.glob('../../../apps/desktop/src/**/*.stories.tsx', {
    eager: true,
  }),
} as Record<string, Record<string, unknown>>

const files: StoryFile[] = Object.values(modules)
  .flatMap((mod) => Object.values(mod))
  .filter(
    (v): v is StoryFile =>
      typeof v === 'object' &&
      v !== null &&
      'title' in v &&
      'stories' in v &&
      Array.isArray((v as StoryFile).stories),
  )
  .sort((a, b) => a.title.localeCompare(b.title))

const VIEWPORTS = {
  panel: { label: 'panel 640', width: 640 },
  bar: { label: 'bar strip', width: 1400 },
  www: { label: 'www wide', width: 960 },
} as const
type Viewport = keyof typeof VIEWPORTS

function Workbench() {
  const [fileIdx, setFileIdx] = useState(0)
  const [storyIdx, setStoryIdx] = useState(0)
  const [theme, setTheme] = useState('launcharr')
  const [viewport, setViewport] = useState<Viewport>('panel')

  useEffect(() => {
    applyTheme(theme, undefined, 'panel')
  }, [theme])

  const file = files[fileIdx]
  const story = file?.stories[Math.min(storyIdx, file.stories.length - 1)]
  const themes = useMemo(() => Object.keys(BUILTIN_THEMES), [])

  return (
    <div className="wb">
      <aside className="wb-side tui">
        <Panel title="tui workbench" subtitle={`${files.length} components`}>
          {files.map((f, i) => (
            <div key={f.title}>
              <ListRow
                label={f.title}
                selected={i === fileIdx}
                right={String(f.stories.length)}
                onClick={() => {
                  setFileIdx(i)
                  setStoryIdx(0)
                }}
              />
              {i === fileIdx &&
                f.stories.map((s, j) => (
                  <ListRow
                    key={s.name}
                    icon={j === storyIdx ? '▸' : ' '}
                    dim={j !== storyIdx}
                    label={s.name}
                    onClick={() => setStoryIdx(j)}
                  />
                ))}
            </div>
          ))}
        </Panel>
        <div className="wb-controls">
          <select value={theme} onChange={(e) => setTheme(e.target.value)}>
            {themes.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <select
            value={viewport}
            onChange={(e) => setViewport(e.target.value as Viewport)}
          >
            {Object.entries(VIEWPORTS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
      </aside>
      <main className="wb-stage">
        {story && (
          <div
            className="wb-story"
            style={{ width: VIEWPORTS[viewport].width }}
          >
            <div className="wb-story-head">
              {file!.title} / {story.name}
            </div>
            <div className="tui wb-canvas">{story.render()}</div>
            {story.keys && (
              <div className="tui">
                <KeyHints
                  hints={story.keys.split('·').map((part) => {
                    const [keys, ...rest] = part.trim().split(' ')
                    return { keys: keys ?? '', label: rest.join(' ') }
                  })}
                />
              </div>
            )}
            {story.notes && <p className="wb-notes">{story.notes}</p>}
          </div>
        )}
      </main>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Workbench />)
