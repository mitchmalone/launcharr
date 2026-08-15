import type { ReactNode } from 'react'

/**
 * The workbench's story contract. A story is one component in ONE state —
 * the point is exhaustive states ("selected, not hovered" — see JOURNAL
 * 2026-08-16), not pretty screens. `keys` documents expected keyboard
 * behavior and renders as a hint strip under the story.
 */
export interface Story {
  name: string
  notes?: string
  keys?: string
  render: () => ReactNode
}

export interface StoryFile {
  /** Sidebar group, e.g. "ListRow" or "Compositions". */
  title: string
  stories: Story[]
}

export function defineStories(title: string, stories: Story[]): StoryFile {
  return { title, stories }
}
