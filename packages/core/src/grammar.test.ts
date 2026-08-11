import { describe, expect, it } from 'vitest'

import { parseInput } from './grammar'

const TRIGGERS = new Set(['lorem', 'json', 'ip', 'clip'])

describe('parseInput', () => {
  it('defaults to launch mode', () => {
    expect(parseInput('safari', TRIGGERS)).toEqual({
      mode: 'launch',
      query: 'safari',
    })
    expect(parseInput('', TRIGGERS)).toEqual({ mode: 'launch', query: '' })
  })

  it('dispatches bang mode on a leading !', () => {
    expect(parseInput('!git status', TRIGGERS)).toEqual({
      mode: 'bang',
      command: 'git status',
    })
  })

  it('bang alone is an empty command (opens a terminal window)', () => {
    expect(parseInput('!', TRIGGERS)).toEqual({ mode: 'bang', command: '' })
  })

  it('passes the command through verbatim — no trimming, no quoting games', () => {
    expect(parseInput('! echo "hi"  ', TRIGGERS)).toEqual({
      mode: 'bang',
      command: ' echo "hi"  ',
    })
  })

  it('only the first character dispatches bang', () => {
    expect(parseInput('mail!', TRIGGERS)).toEqual({
      mode: 'launch',
      query: 'mail!',
    })
  })

  it('a bang later in a bang command is part of the command', () => {
    expect(parseInput('!!last', TRIGGERS)).toEqual({
      mode: 'bang',
      command: '!last',
    })
  })

  it('dispatches trigger mode on a whole first token', () => {
    expect(parseInput('lorem 3', TRIGGERS)).toEqual({
      mode: 'trigger',
      trigger: 'lorem',
      args: '3',
    })
    expect(parseInput('json', TRIGGERS)).toEqual({
      mode: 'trigger',
      trigger: 'json',
      args: '',
    })
  })

  it('trigger args pass through verbatim after the first space', () => {
    expect(parseInput('clip  two spaces ', TRIGGERS)).toEqual({
      mode: 'trigger',
      trigger: 'clip',
      args: ' two spaces ',
    })
  })

  it('a partial trigger word stays a launch query', () => {
    expect(parseInput('jso', TRIGGERS)).toEqual({
      mode: 'launch',
      query: 'jso',
    })
    expect(parseInput('lorems', TRIGGERS)).toEqual({
      mode: 'launch',
      query: 'lorems',
    })
  })

  it('bang wins over triggers', () => {
    expect(parseInput('!json', TRIGGERS)).toEqual({
      mode: 'bang',
      command: 'json',
    })
  })

  it('dispatches emoji mode on a leading colon', () => {
    expect(parseInput(':fire', TRIGGERS)).toEqual({
      mode: 'emoji',
      query: 'fire',
    })
    expect(parseInput(':', TRIGGERS)).toEqual({ mode: 'emoji', query: '' })
  })

  it('a colon later in the input stays launch mode', () => {
    expect(parseInput('localhost:3000', TRIGGERS)).toEqual({
      mode: 'launch',
      query: 'localhost:3000',
    })
  })

  it('unknown triggers stay launch queries', () => {
    expect(parseInput('translate hello', TRIGGERS)).toEqual({
      mode: 'launch',
      query: 'translate hello',
    })
  })
})
