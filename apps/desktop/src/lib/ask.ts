/**
 * Parse one line of agent-CLI output into what the answer surface needs.
 * Handles both providers: `claude -p --output-format stream-json` (text
 * deltas + final result) and `codex exec --json` (thread/turn/item events,
 * no deltas — verified against codex-cli 0.147). Pure — the Rust side is a
 * dumb spawner emitting raw lines.
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
  /** codex exec --json shapes. */
  item?: { type?: string; text?: string }
  message?: string
  error?: { message?: string }
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
  // codex: whole messages arrive at once; emit as deltas so multiple
  // agent_message items append rather than replace.
  if (
    parsed.type === 'item.completed' &&
    parsed.item?.type === 'agent_message' &&
    typeof parsed.item.text === 'string'
  ) {
    return { delta: parsed.item.text }
  }
  if (parsed.type === 'error' && typeof parsed.message === 'string') {
    return { error: parsed.message }
  }
  if (parsed.type === 'turn.failed') {
    return { error: parsed.error?.message ?? 'the codex CLI reported an error' }
  }
  return {}
}
