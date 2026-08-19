// launcharr script: show local IP addresses (zero-network: no external lookups).
// Yours to edit. Runs under Bun (docs/SCRIPTS.md); `ip ⏎` in the launcher.
//
// The type import is erased at run time — it's there so an editor in the repo
// (or one that resolves @launcharr/core) checks the contract for you.
import type { ScriptItem } from '@launcharr/core/types'
import { execFileSync } from 'node:child_process'

const INTERFACES = ['en0', 'en1', 'en2', 'utun0']

export function manifest() {
  return {
    trigger: 'ip',
    name: 'IP address',
    description: 'Local network addresses (no external lookup)',
  }
}

/** `ipconfig getifaddr <iface>` — empty when the interface has no address. */
function addressOf(iface: string): string {
  try {
    return execFileSync('/usr/sbin/ipconfig', ['getifaddr', iface], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return ''
  }
}

export function query(): { items: ScriptItem[] } {
  const items: ScriptItem[] = []
  for (const iface of INTERFACES) {
    const addr = addressOf(iface)
    if (addr) {
      items.push({
        title: addr,
        subtitle: `${iface} · copy`,
        action: { type: 'copy', value: addr },
      })
    }
  }
  if (items.length === 0) {
    items.push({
      title: 'No active network interface',
      subtitle: 'nothing on the horizon',
      action: { type: 'none' },
    })
  }
  return { items }
}

if (import.meta.main) {
  const mode = process.argv[2]
  if (mode === 'manifest') console.log(JSON.stringify(manifest()))
  else if (mode === 'query') console.log(JSON.stringify(query()))
  else {
    console.error('usage: ip.ts manifest|query <args>')
    process.exit(1)
  }
}
