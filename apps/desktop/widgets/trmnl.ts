// launcharr widget: TRMNL e-ink device battery (docs/WIDGETS.md).
//
// Polls https://trmnl.com/api/devices with your account API key and paints a
// tablet glyph toned by the lowest device battery (blue > 40 %, amber ≤ 40 %,
// red < 20 % — the number shows only in the red tier, like the Mac's own
// battery cell). The card lists every device with charge, voltage and last ping.
//
// The key comes from TRMNL_API_KEY, else from the `secret` helper
// (`secret shared/trmnl/api_key`) — launcharr never sees or stores it; the
// widget is inert without one: `{"hidden": true}`, no cell, no request
// (DECISIONS 2026-08-16).
//
// Install: copy into ~/.config/launcharr/widgets/. Runs under Bun.
import type { WidgetTone, WidgetView } from '@launcharr/tui/bar/types'
import { spawnSync } from 'node:child_process'

const DEVICES_URL = process.env.TRMNL_API_URL ?? 'https://trmnl.com/api/devices'
const SECRET_ID = process.env.TRMNL_API_SECRET_ID ?? 'shared/trmnl/api_key'
const DASHBOARD_URL = 'https://usetrmnl.com/devices'

export type Device = {
  name?: string
  friendly_id?: string
  percent_charged?: number
  battery_voltage?: number
  hardware_last_ping_at?: string
  last_ping_at?: string
}

export function manifest() {
  return {
    id: 'trmnl',
    name: 'TRMNL',
    interval: 300,
    zone: 'right',
    icon: 'tablet',
    timeout: 30,
  }
}

/** TRMNL_API_KEY, else `secret <id>` (a function in the interactive zsh). */
function token(): string {
  const env = process.env.TRMNL_API_KEY
  if (env) return env
  const out = spawnSync('zsh', ['-ic', `secret ${SECRET_ID}`], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 20000,
  })
  const lines = (out.stdout ?? '').trim().split('\n')
  return out.status === 0 ? (lines[lines.length - 1] ?? '') : ''
}

/** '3m ago' / '2h ago' / '4d ago' since an ISO timestamp, or null. */
export function age(iso: string | undefined, now = Date.now()): string | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  const s = Math.max(0, Math.floor((now - t) / 1000))
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export function tone(pct: number | null): WidgetTone {
  if (pct == null) return 'muted'
  if (pct < 20) return 'error'
  if (pct <= 40) return 'warn'
  return 'ok'
}

/** The view for one device list — pure, so it's testable. */
export function view(devices: Device[], now = Date.now()): WidgetView {
  const levels: number[] = []
  const rows = devices.map((d) => {
    const pct =
      typeof d.percent_charged === 'number'
        ? Math.round(d.percent_charged)
        : null
    if (pct != null) levels.push(pct)
    const bits = [
      d.battery_voltage ? `${d.battery_voltage}V` : null,
      age(d.hardware_last_ping_at ?? d.last_ping_at, now),
    ].filter(Boolean)
    const name = d.name ?? 'TRMNL'
    return {
      dot: tone(pct),
      text: pct != null ? `${name} · ${pct}%` : name,
      hint: bits.length ? bits.join(' · ') : null,
      action: { type: 'open' as const, value: DASHBOARD_URL },
    }
  })
  const low = levels.length ? Math.min(...levels) : null
  const t = tone(low)
  return {
    icon: 'tablet',
    label: t === 'error' ? `${low}%` : null,
    tone: t,
    click: { type: 'open', value: DASHBOARD_URL },
    card: {
      title: 'TRMNL',
      subtitle: `${devices.length} device${devices.length === 1 ? '' : 's'}`,
      rows,
      hint: 'click to open usetrmnl.com',
    },
  }
}

async function tick(): Promise<WidgetView> {
  const key = token()
  if (!key) {
    // No credential → no cell, no request (DECISIONS 2026-08-16).
    console.error(`no TRMNL key: set TRMNL_API_KEY or \`secret ${SECRET_ID}\``)
    return { hidden: true }
  }
  const res = await fetch(DEVICES_URL, {
    headers: {
      Authorization: `Bearer ${key}`,
      'User-Agent': 'launcharr-widget',
    },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`trmnl api ${res.status}`)
  const body = (await res.json()) as { data?: unknown }
  if (!Array.isArray(body?.data)) throw new Error('unexpected TRMNL response')
  return view(body.data as Device[])
}

if (import.meta.main) {
  const cmd = process.argv[2]
  if (cmd === 'manifest') console.log(JSON.stringify(manifest()))
  else if (cmd === 'tick') {
    tick()
      .then((v) => console.log(JSON.stringify(v)))
      .catch((e) => {
        console.error(e instanceof Error ? e.message : String(e))
        process.exit(1)
      })
  } else {
    console.error('usage: trmnl.ts manifest|tick')
    process.exit(1)
  }
}
