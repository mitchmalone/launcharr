// launcharr script: format the JSON on your clipboard and copy it back.
// Yours to edit. Runs under Bun (docs/SCRIPTS.md); `json ⏎` in the launcher.
//
// The type import is erased at run time — it's there so an editor in the repo
// (or one that resolves @launcharr/core) checks the contract for you.
import type { ScriptItem } from '@launcharr/core/types'
import { execFileSync } from 'node:child_process'

export function manifest() {
  return {
    trigger: 'json',
    name: 'Format JSON',
    description: 'Pretty-print clipboard JSON and copy it back',
  }
}

/** The clipboard's text, via pbpaste (empty when it isn't text). */
function clipboard(): string {
  try {
    return execFileSync('/usr/bin/pbpaste', { encoding: 'utf8' })
  } catch {
    return ''
  }
}

/** The rows for one clipboard payload — pure, so it's testable. */
export function itemsFor(raw: string): ScriptItem[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    return [
      {
        title: 'Clipboard is not valid JSON',
        subtitle: String(err instanceof Error ? err.message : err).slice(0, 80),
        action: { type: 'none' },
      },
    ]
  }
  const formatted = JSON.stringify(parsed, null, 2)
  const lines = formatted.split('\n').length
  const preview = formatted.split(/\s+/).join(' ').slice(0, 64)
  return [
    {
      title: `Copy formatted JSON (${lines} lines)`,
      subtitle: preview,
      action: { type: 'copy', value: formatted },
    },
    {
      title: 'Copy minified JSON',
      subtitle: 'single line, no whitespace',
      action: { type: 'copy', value: JSON.stringify(parsed) },
    },
  ]
}

if (import.meta.main) {
  const mode = process.argv[2]
  if (mode === 'manifest') console.log(JSON.stringify(manifest()))
  else if (mode === 'query') {
    console.log(JSON.stringify({ items: itemsFor(clipboard()) }))
  } else {
    console.error('usage: json-format.ts manifest|query <args>')
    process.exit(1)
  }
}
