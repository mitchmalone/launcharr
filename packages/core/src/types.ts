export type ItemKind =
  | 'app'
  | 'settings'
  | 'launcharr'
  | 'link'
  | 'command'
  /** A panel trigger word (wifi, usage…) surfaced as a rankable item so it fuzzy-matches
   * like an app; `path` carries the trigger word. Exact-token typing still goes through
   * the grammar's trigger mode. */
  | 'panel'

export type IndexItem = {
  id: string
  name: string
  kind: ItemKind
  path: string
  hint: string
  icon: string | null
  aliases: string[]
  browser?: string | null
}

export type Link = {
  name: string
  url: string
  /** Optional trigger word: with a {query} placeholder this becomes a Raycast-style quicklink. */
  trigger?: string | null
}

export type FrecencyMap = Record<string, number>

export type ScriptInfo = {
  trigger: string
  name: string
  description: string
  path: string
}

export type ScriptAction =
  | { type: 'copy'; value: string }
  | { type: 'open'; value: string }
  | { type: 'none' }

export type ScriptItem = {
  title: string
  subtitle: string
  action: ScriptAction
  altAction?: ScriptAction | null
}

export type Clip = {
  id: number
  content: string
  ts: number
}
