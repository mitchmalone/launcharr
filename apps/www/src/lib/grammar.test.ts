import { describe, expect, it } from 'vitest'

import { parseInput } from './grammar'

describe('parseInput', () => {
  it('treats plain text as a launch query', () => {
    expect(parseInput('ghostty')).toEqual({ mode: 'launch', query: 'ghostty' })
  })

  it('treats a leading ! as bang mode with the rest as the command', () => {
    expect(parseInput('!git status')).toEqual({
      mode: 'bang',
      command: 'git status',
    })
  })

  it('treats a bare ! as bang mode with an empty command', () => {
    expect(parseInput('!')).toEqual({ mode: 'bang', command: '' })
  })

  it('treats a leading : as emoji mode', () => {
    expect(parseInput(':fire')).toEqual({ mode: 'emoji', query: 'fire' })
  })

  it('recognises a quicklink trigger word with args', () => {
    expect(parseInput('yt cute otters')).toEqual({
      mode: 'trigger',
      trigger: 'yt',
      args: 'cute otters',
    })
  })

  it('recognises a bare quicklink trigger with empty args', () => {
    expect(parseInput('yt')).toEqual({
      mode: 'trigger',
      trigger: 'yt',
      args: '',
    })
  })

  it('does not treat a non-trigger first word as a trigger', () => {
    expect(parseInput('youtube cats')).toEqual({
      mode: 'launch',
      query: 'youtube cats',
    })
  })
})
