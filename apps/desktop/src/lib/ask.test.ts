import { describe, expect, it } from 'vitest'

import { parseAskLine } from './ask'

describe('parseAskLine', () => {
  it('extracts text deltas from stream events', () => {
    const line = JSON.stringify({
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: 'ahoy' },
      },
    })
    expect(parseAskLine(line)).toEqual({ delta: 'ahoy' })
  })

  it('extracts the final result as fallback', () => {
    expect(
      parseAskLine(
        JSON.stringify({
          type: 'result',
          subtype: 'success',
          result: 'full answer',
        }),
      ),
    ).toEqual({ final: 'full answer' })
  })

  it('surfaces CLI errors', () => {
    const ev = parseAskLine(
      JSON.stringify({
        type: 'result',
        is_error: true,
        result: 'not logged in',
      }),
    )
    expect(ev.error).toBe('not logged in')
  })

  it('ignores system/init lines and non-JSON noise', () => {
    expect(
      parseAskLine(JSON.stringify({ type: 'system', subtype: 'init' })),
    ).toEqual({})
    expect(parseAskLine('not json at all')).toEqual({})
  })
})
