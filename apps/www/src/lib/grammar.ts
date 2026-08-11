import { TRIGGERS } from './launch-index'

export type ParsedInput =
  | { mode: 'bang'; command: string }
  | { mode: 'emoji'; query: string }
  | { mode: 'trigger'; trigger: string; args: string }
  | { mode: 'launch'; query: string }

export function parseInput(raw: string): ParsedInput {
  if (raw[0] === '!') return { mode: 'bang', command: raw.slice(1) }
  if (raw[0] === ':') return { mode: 'emoji', query: raw.slice(1) }
  const i = raw.indexOf(' ')
  const first = i === -1 ? raw : raw.slice(0, i)
  if (first.length > 0 && TRIGGERS.has(first)) {
    return {
      mode: 'trigger',
      trigger: first,
      args: i === -1 ? '' : raw.slice(i + 1),
    }
  }
  return { mode: 'launch', query: raw }
}
