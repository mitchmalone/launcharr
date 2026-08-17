import { describe, expect, it } from 'vitest'

import { parseMarkdownLite, parseSpans } from './markdown'

describe('parseSpans', () => {
  it('parses bold, italic, and inline code', () => {
    expect(
      parseSpans('use **git rebase** or `git merge`, *carefully*'),
    ).toEqual([
      { text: 'use ' },
      { text: 'git rebase', bold: true },
      { text: ' or ' },
      { text: 'git merge', code: true },
      { text: ', ' },
      { text: 'carefully', italic: true },
    ])
  })

  it('leaves plain text and stray asterisks alone', () => {
    expect(parseSpans('2 * 3 = 6')).toEqual([{ text: '2 * 3 = 6' }])
  })
})

describe('parseMarkdownLite', () => {
  it('parses fences with language', () => {
    const blocks = parseMarkdownLite('before\n```sh\nls -la\n```\nafter')
    expect(blocks).toEqual([
      { kind: 'para', spans: [{ text: 'before' }] },
      { kind: 'code', lang: 'sh', text: 'ls -la' },
      { kind: 'para', spans: [{ text: 'after' }] },
    ])
  })

  it('treats an unterminated fence as code (streaming)', () => {
    const blocks = parseMarkdownLite('```\npartial code')
    expect(blocks).toEqual([{ kind: 'code', lang: '', text: 'partial code' }])
  })

  it('parses headings, bullets, and numbered items', () => {
    const blocks = parseMarkdownLite('## Title\n- one\n  - nested\n1. first')
    expect(blocks[0]).toEqual({
      kind: 'heading',
      level: 2,
      spans: [{ text: 'Title' }],
    })
    expect(blocks[1]).toMatchObject({ kind: 'bullet', indent: 0 })
    expect(blocks[2]).toMatchObject({ kind: 'bullet', indent: 1 })
    expect(blocks[3]).toMatchObject({ kind: 'numbered', marker: '1' })
  })
})
