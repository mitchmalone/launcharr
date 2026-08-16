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

  it('parses codex exec --json events', () => {
    expect(
      parseAskLine(
        JSON.stringify({
          type: 'item.completed',
          item: { id: 'item_0', type: 'agent_message', text: 'ahoy' },
        }),
      ),
    ).toEqual({ delta: 'ahoy' })
    // Non-message items (reasoning, command) don't render.
    expect(
      parseAskLine(
        JSON.stringify({
          type: 'item.completed',
          item: { type: 'reasoning', text: 'thinking…' },
        }),
      ),
    ).toEqual({})
    expect(
      parseAskLine(JSON.stringify({ type: 'thread.started', thread_id: 'x' })),
    ).toEqual({})
    expect(
      parseAskLine(JSON.stringify({ type: 'error', message: 'not logged in' })),
    ).toEqual({ error: 'not logged in' })
    expect(
      parseAskLine(
        JSON.stringify({ type: 'turn.failed', error: { message: 'boom' } }),
      ),
    ).toEqual({ error: 'boom' })
  })

  it('ignores system/init lines and non-JSON noise', () => {
    expect(
      parseAskLine(JSON.stringify({ type: 'system', subtype: 'init' })),
    ).toEqual({})
    expect(parseAskLine('not json at all')).toEqual({})
  })
})
