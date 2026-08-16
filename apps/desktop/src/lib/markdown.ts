/**
 * Markdown-lite for the ? answer surface: the subset Claude answers actually use —
 * bold, italic, inline code, fenced code, headings, lists. Pure and dependency-free;
 * parsing is separate from rendering so it's testable. Tolerates streaming: an
 * unterminated fence renders as code rather than leaking backticks.
 */

export interface Span {
  text: string
  bold?: boolean
  italic?: boolean
  code?: boolean
}

export type Block =
  | { kind: 'code'; lang: string; text: string }
  | { kind: 'heading'; level: number; spans: Span[] }
  | { kind: 'bullet'; indent: number; spans: Span[] }
  | { kind: 'numbered'; marker: string; spans: Span[] }
  | { kind: 'para'; spans: Span[] }

const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g

export function parseSpans(text: string): Span[] {
  const spans: Span[] = []
  let last = 0
  for (const m of text.matchAll(INLINE)) {
    const idx = m.index ?? 0
    if (idx > last) spans.push({ text: text.slice(last, idx) })
    const tok = m[0]
    if (tok.startsWith('`')) {
      spans.push({ text: tok.slice(1, -1), code: true })
    } else if (tok.startsWith('**')) {
      spans.push({ text: tok.slice(2, -2), bold: true })
    } else {
      spans.push({ text: tok.slice(1, -1), italic: true })
    }
    last = idx + tok.length
  }
  if (last < text.length) spans.push({ text: text.slice(last) })
  return spans
}

export function parseMarkdownLite(text: string): Block[] {
  const blocks: Block[] = []
  const lines = text.split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i] ?? ''
    const fence = /^```(\w*)\s*$/.exec(line)
    if (fence) {
      const buf: string[] = []
      i++
      while (i < lines.length && !/^```\s*$/.test(lines[i] ?? '')) {
        buf.push(lines[i] ?? '')
        i++
      }
      i++ // closing fence, or EOF mid-stream — either way the buffer is code
      blocks.push({ kind: 'code', lang: fence[1] ?? '', text: buf.join('\n') })
      continue
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line)
    if (heading) {
      blocks.push({
        kind: 'heading',
        level: (heading[1] ?? '').length,
        spans: parseSpans(heading[2] ?? ''),
      })
      i++
      continue
    }
    const bullet = /^(\s*)[-*]\s+(.*)$/.exec(line)
    if (bullet) {
      blocks.push({
        kind: 'bullet',
        indent: Math.floor((bullet[1] ?? '').length / 2),
        spans: parseSpans(bullet[2] ?? ''),
      })
      i++
      continue
    }
    const numbered = /^\s*(\d+)[.)]\s+(.*)$/.exec(line)
    if (numbered) {
      blocks.push({
        kind: 'numbered',
        marker: numbered[1] ?? '',
        spans: parseSpans(numbered[2] ?? ''),
      })
      i++
      continue
    }
    blocks.push({ kind: 'para', spans: parseSpans(line) })
    i++
  }
  return blocks
}
