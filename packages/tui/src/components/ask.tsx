import { type Span, parseMarkdownLite } from '@launcharr/core/markdown'
import { type ReactNode, useEffect, useState } from 'react'

/**
 * `?` agent mode's conversation surface (Notion "Agent Mode Feedback", 2026-08-17).
 * Presentational: the app owns the CLI stream and hands over turns; the website demo
 * hands over canned ones — same component, no second copy (invariant 10).
 *
 * Layout the app composes around it: the *first* question is pinned in the panel
 * header (`AskPinned`), the transcript scrolls below, the follow-up input sits at
 * the bottom. Follow-up prompts repeat inside the transcript as `❯` lines; the
 * first one does not (it's the header).
 */

export interface AskTurn {
  prompt: string
  /** Streamed answer so far (markdown-lite). */
  answer: string
  /** True once the CLI reported the turn finished. */
  done: boolean
  /** Terminal error the CLI reported for this turn. */
  error?: string
}

/** Claude Code's spinner glyph cycle — a breathing asterisk, in the theme accent. */
export const ASK_SPINNER_FRAMES = [
  '·',
  '✢',
  '✳',
  '✶',
  '✻',
  '✽',
  '✻',
  '✶',
  '✳',
  '✢',
]
/** Whimsical progress verbs, Claude-style; one is picked per thinking spell and the
 * label shimmers rather than cycling frantically. */
export const ASK_THINKING_VERBS = [
  'Thinking',
  'Pondering',
  'Musing',
  'Brewing',
  'Percolating',
  'Cogitating',
  'Noodling',
  'Ruminating',
  'Deliberating',
  'Mulling',
  'Puzzling',
  'Chewing on it',
]

const SPINNER_MS = 110
const VERB_MS = 2400

/** Animated spinner glyph; only mounted while busy so it never ticks on the hot path. */
export function AskSpinner({ className = '' }: { className?: string }) {
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    const id = setInterval(
      () => setFrame((f) => (f + 1) % ASK_SPINNER_FRAMES.length),
      SPINNER_MS,
    )
    return () => clearInterval(id)
  }, [])
  return (
    <span className={`tui-ask-spinner ${className}`} aria-hidden>
      {ASK_SPINNER_FRAMES[frame]}
    </span>
  )
}

/** "✻ Pondering…" with a shimmer sweep; the verb rotates every couple of seconds. */
export function AskThinking({ label }: { label?: string }) {
  const [verb, setVerb] = useState(
    () =>
      ASK_THINKING_VERBS[
        Math.floor(Math.random() * ASK_THINKING_VERBS.length)
      ]!,
  )
  useEffect(() => {
    if (label) return
    const id = setInterval(() => {
      setVerb((v) => {
        const others = ASK_THINKING_VERBS.filter((x) => x !== v)
        return others[Math.floor(Math.random() * others.length)] ?? v
      })
    }, VERB_MS)
    return () => clearInterval(id)
  }, [label])
  return (
    <div className="tui-ask-thinking" role="status">
      <AskSpinner />
      <span className="tui-ask-shimmer">{label ?? verb}…</span>
    </div>
  )
}

/** The header line: `?` sigil + the conversation's first question, ellipsized;
 * a spinner rides at the right edge while the CLI works. */
export function AskPinned({
  prompt,
  busy,
  sigil = '?',
}: {
  prompt: string
  busy: boolean
  sigil?: ReactNode
}) {
  return (
    <div className="tui-ask-pinned">
      <span className="tui-ask-pinned-sigil">{sigil}</span>
      <span className="tui-ask-pinned-text" title={prompt}>
        {prompt}
      </span>
      {busy && <AskSpinner className="tui-ask-pinned-spinner" />}
    </div>
  )
}

function renderSpans(spans: Span[]) {
  return spans.map((s, i) =>
    s.code ? (
      <code key={i}>{s.text}</code>
    ) : s.bold ? (
      <strong key={i}>{s.text}</strong>
    ) : s.italic ? (
      <em key={i}>{s.text}</em>
    ) : (
      <span key={i}>{s.text}</span>
    ),
  )
}

/** Markdown-lite blocks → DOM. Exported so anything else that shows agent prose
 * (a future card, the help panel) renders it identically. */
export function AskMarkdown({ text }: { text: string }) {
  return (
    <>
      {parseMarkdownLite(text).map((block, i) => {
        switch (block.kind) {
          case 'code':
            return (
              <pre key={i} className="md-code">
                {block.text}
              </pre>
            )
          case 'heading':
            return (
              <div key={i} className={`md-h md-h${block.level}`}>
                {renderSpans(block.spans)}
              </div>
            )
          case 'bullet':
            return (
              <div
                key={i}
                className="md-li"
                style={{ paddingLeft: 14 + block.indent * 14 }}
              >
                • {renderSpans(block.spans)}
              </div>
            )
          case 'numbered':
            return (
              <div key={i} className="md-li" style={{ paddingLeft: 14 }}>
                {block.marker}. {renderSpans(block.spans)}
              </div>
            )
          case 'para':
            return (
              <div key={i} className="md-p">
                {renderSpans(block.spans)}
              </div>
            )
        }
      })}
    </>
  )
}

/**
 * The scrolling transcript. Pass a `scrollRef` to keep the newest text in view
 * (the app scrolls to the bottom on every delta). `pinnedFirst` (default true)
 * omits turn 0's prompt because `AskPinned` shows it.
 */
export function AskSurface({
  turns,
  pinnedFirst = true,
  scrollRef,
  className = '',
}: {
  turns: AskTurn[]
  pinnedFirst?: boolean
  scrollRef?: React.Ref<HTMLDivElement>
  className?: string
}) {
  return (
    <div className={`tui tui-ask ${className}`} ref={scrollRef}>
      {turns.map((turn, i) => {
        const thinking = !turn.done && turn.answer === '' && !turn.error
        const streaming = !turn.done && turn.answer !== ''
        return (
          <div key={i} className="tui-ask-turn">
            {(i > 0 || !pinnedFirst) && (
              <div className="tui-ask-prompt">
                <span className="tui-ask-prompt-sigil">❯</span> {turn.prompt}
              </div>
            )}
            {turn.answer !== '' && (
              <div className="tui-ask-answer">
                <AskMarkdown text={turn.answer} />
                {streaming && <span className="tui-ask-cursor">▊</span>}
              </div>
            )}
            {thinking && <AskThinking />}
            {turn.error && <div className="tui-ask-error">⚠ {turn.error}</div>}
          </div>
        )
      })}
    </div>
  )
}
