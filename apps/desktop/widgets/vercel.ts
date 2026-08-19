// launcharr widget: latest Vercel deployment per project (docs/WIDGETS.md).
//
// The reference widget for the **stored-token** half of widget settings:
// `VERCEL_TOKEN` (a personal token from vercel.com/account/tokens, pasted into
// Settings → Menubar → Custom widgets, kept in the Keychain) arrives as env on
// every tick; the team is the Vercel CLI's current one (or VERCEL_TEAM_ID in
// the environment). Without a token the widget falls back to what the CLI
// stores (`vercel login`) — note CLI 58+ keeps a short-lived token the widget
// can't refresh (JOURNAL 2026-08-19), which is why the setting exists. One `GET /v9/projects` per tick: each project's
// latest production deployment becomes a row; the cell is the Vercel triangle,
// dashed and red while any deployment has failed, amber while one is building.
// With no token from anywhere the widget is hidden (no cell, no request).
//
// Install: copy into ~/.config/launcharr/widgets/. Runs under Bun.
import type { WidgetTone, WidgetView } from '@launcharr/tui/bar/types'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const API = 'https://api.vercel.com'
const CLI_DIR = join(homedir(), 'Library/Application Support/com.vercel.cli')
const MAX_ROWS = 12

const TONES: Record<string, WidgetTone> = {
  READY: 'ok',
  ERROR: 'error',
  CANCELED: 'muted',
  BUILDING: 'warn',
  QUEUED: 'warn',
  INITIALIZING: 'warn',
}

export type Deployment = {
  id?: string
  url?: string
  readyState?: string
  createdAt?: number
  target?: string | null
  alias?: string[]
}

export type Project = { name: string; latestDeployments?: Deployment[] }

export function manifest() {
  return {
    id: 'vercel',
    name: 'Vercel',
    interval: 120,
    zone: 'right',
    icon: 'triangle',
    timeout: 20,
    settings: [
      {
        key: 'VERCEL_TOKEN',
        label: 'Vercel',
        hint: 'a token from vercel.com/account/tokens',
        secret: true,
      },
    ],
  }
}

function readJson(path: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

/** Token + team from the env, else the Vercel CLI's own store. */
function credentials(): { token: string | null; team: string | null } {
  const auth = readJson(join(CLI_DIR, 'auth.json'))
  const cfg = readJson(join(CLI_DIR, 'config.json'))
  const token = process.env.VERCEL_TOKEN ?? (auth.token as string | undefined)
  const team =
    process.env.VERCEL_TEAM_ID ?? (cfg.currentTeam as string | undefined)
  return { token: token ?? null, team: team ?? null }
}

async function get<T>(
  path: string,
  token: string,
  params: Record<string, string | null> = {},
): Promise<T> {
  const url = new URL(API + path)
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v)
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'launcharr-widget',
    },
    signal: AbortSignal.timeout(12000),
  })
  if (res.status === 401 || res.status === 403) {
    throw new Error(
      process.env.VERCEL_TOKEN
        ? `Vercel rejected the token (${res.status}) — set a new one in Settings`
        : `Vercel rejected the CLI login (${res.status}) — it expires; run \`vercel whoami\` or set a token in Settings`,
    )
  }
  if (!res.ok) throw new Error(`vercel api ${res.status} on ${path}`)
  return (await res.json()) as T
}

/** '3m' / '2h' / '4d' since an epoch-ms timestamp, or null. */
export function age(ms: number | undefined, now = Date.now()): string | null {
  if (typeof ms !== 'number') return null
  const s = Math.max(0, Math.floor((now - ms) / 1000))
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

/** The view for one project list — pure, so it's testable. */
export function view(
  projects: Project[],
  slug: string | null,
  now = Date.now(),
): WidgetView {
  const rows: {
    sort: number
    row: NonNullable<NonNullable<WidgetView['card']>['rows']>[number]
  }[] = []
  const states: string[] = []
  for (const p of projects) {
    const deps = p.latestDeployments ?? []
    const prod = deps.filter((d) => d.target === 'production')
    const pool = prod.length ? prod : deps
    if (!pool.length) continue
    const d = pool.reduce((a, b) =>
      (b.createdAt ?? 0) > (a.createdAt ?? 0) ? b : a,
    )
    const state = (d.readyState ?? '').toUpperCase()
    states.push(state)
    const aliases = d.alias ?? []
    const domain =
      aliases.find((a) => !a.endsWith('.vercel.app')) ?? aliases[0] ?? d.url
    const dpl = (d.id ?? '').replace(/^dpl_/, '')
    const url =
      slug && dpl
        ? `https://vercel.com/${slug}/${p.name}/${dpl}`
        : `https://vercel.com/${slug ?? ''}/${p.name}`
    rows.push({
      sort: d.createdAt ?? 0,
      row: {
        dot: TONES[state] ?? 'muted',
        text: domain ? `${p.name} → ${domain}` : p.name,
        hint: age(d.createdAt, now),
        action: { type: 'open', value: url },
      },
    })
  }
  rows.sort((a, b) => b.sort - a.sort)
  const failed = states.filter((s) => s === 'ERROR').length
  const building = states.some((s) => TONES[s] === 'warn')
  return {
    icon: failed ? 'triangle-dashed' : 'triangle',
    label: failed ? String(failed) : null,
    tone: failed ? 'error' : building ? 'warn' : 'ok',
    click: {
      type: 'open',
      value: slug ? `https://vercel.com/${slug}` : 'https://vercel.com',
    },
    card: {
      title: 'Vercel',
      subtitle: failed
        ? `${failed} failed`
        : building
          ? 'deploying…'
          : `${rows.length} projects ready`,
      rows: rows.slice(0, MAX_ROWS).map((r) => r.row),
      hint: 'click a project to open the deployment',
    },
  }
}

async function tick(): Promise<WidgetView> {
  const { token, team } = credentials()
  if (!token) {
    // No credential → no cell, no request (DECISIONS 2026-08-16).
    console.error('no Vercel token: run `vercel login` or set VERCEL_TOKEN')
    return { hidden: true }
  }
  const slug = team
    ? (await get<{ slug?: string }>(`/v2/teams/${team}`, token)).slug
    : (await get<{ user?: { username?: string } }>('/v2/user', token)).user
        ?.username
  const { projects } = await get<{ projects: Project[] }>(
    '/v9/projects',
    token,
    { teamId: team, limit: '100' },
  )
  return view(projects ?? [], slug ?? null)
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
    console.error('usage: vercel.ts manifest|tick')
    process.exit(1)
  }
}
