// launcharr widget: Upptime status of your sites (docs/WIDGETS.md).
//
// Reads an Upptime `summary.json` (a public array of {name, url, status, time})
// and paints an up/down arrow with the count of sites that are down. The card
// lists every site with a dot; a row opens the site, the cell opens the status
// page. Point UPTIME_SUMMARY_URL / UPTIME_STATUS_URL at your own.
//
// Install: copy into ~/.config/launcharr/widgets/ (or Settings → Menubar →
// Custom widgets → add file). Runs under Bun; the type import is erased.
import type { WidgetView } from '@launcharr/tui/bar/types'

const SUMMARY_URL =
  process.env.UPTIME_SUMMARY_URL ??
  'https://status.droiddroiddroid.com/api/mitchmalone-com/raw/RamenAmok/uptime/master/history/summary.json'
const STATUS_URL =
  process.env.UPTIME_STATUS_URL ?? 'https://status.droiddroiddroid.com/'
const MAX_ROWS = 12

export type UpptimeSite = {
  name?: string
  url?: string
  status?: string
  /** Response time in ms. */
  time?: number
}

export function manifest() {
  return {
    id: 'uptime',
    name: 'Uptime',
    interval: 300,
    zone: 'right',
    icon: 'arrow-big-up',
    timeout: 15,
  }
}

/** The view for one summary — pure, so it's testable. */
export function view(sites: UpptimeSite[]): WidgetView {
  const down = sites.filter((s) => s.status !== 'up')
  const rows = sites.slice(0, MAX_ROWS).map((s) => {
    const up = s.status === 'up'
    return {
      dot: up ? 'ok' : 'error',
      text: s.name ?? s.url ?? 'site',
      hint: up ? (typeof s.time === 'number' ? `${s.time} ms` : null) : 'down',
      action: s.url ? { type: 'open' as const, value: s.url } : null,
    }
  })
  return {
    icon: down.length ? 'arrow-big-down' : 'arrow-big-up',
    label: down.length ? String(down.length) : null,
    tone: down.length ? 'error' : 'ok',
    click: { type: 'open', value: STATUS_URL },
    card: {
      title: 'Uptime',
      subtitle: down.length
        ? `${down.length} of ${sites.length} down`
        : `all ${sites.length} up`,
      rows,
      hint: 'click a site to open it · cell opens the status page',
    },
  }
}

async function tick(): Promise<WidgetView> {
  const res = await fetch(SUMMARY_URL, {
    headers: { 'User-Agent': 'launcharr-widget' },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`summary.json ${res.status}`)
  const sites: unknown = await res.json()
  if (!Array.isArray(sites)) throw new Error('summary.json is not a list')
  return view(sites as UpptimeSite[])
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
    console.error('usage: uptime.ts manifest|tick')
    process.exit(1)
  }
}
