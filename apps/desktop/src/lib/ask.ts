/**
 * Spike: parse one line of `claude -p --output-format stream-json` output into what the
 * answer surface needs. Pure — the Rust side is a dumb spawner emitting raw lines.
 */

export interface AskEvent {
  /** Incremental answer text to append. */
  delta?: string
  /** Complete final answer (fallback when no deltas arrived). */
  final?: string
  /** Terminal error reported by the CLI. */
  error?: string
}

interface StreamLine {
  type?: string
  subtype?: string
  is_error?: boolean
  result?: string
  event?: {
    type?: string
    delta?: { type?: string; text?: string }
  }
}

export function parseAskLine(line: string): AskEvent {
  let parsed: StreamLine
  try {
    parsed = JSON.parse(line) as StreamLine
  } catch {
    return {} // non-JSON noise; ignore
  }
  if (
    parsed.type === 'stream_event' &&
    parsed.event?.delta?.type === 'text_delta' &&
    typeof parsed.event.delta.text === 'string'
  ) {
    return { delta: parsed.event.delta.text }
  }
  if (parsed.type === 'result') {
    if (parsed.is_error) {
      return { error: parsed.result ?? 'the claude CLI reported an error' }
    }
    return { final: parsed.result ?? '' }
  }
  return {}
}
