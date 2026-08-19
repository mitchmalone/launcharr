// launcharr widget: latest GitHub Actions runs (docs/WIDGETS.md).
//
// Reads a JSON feed of workflow runs — the shape the retired Sketchybar module
// consumed: `{"failing": N, "items": [{"repo_label", "workflow", "latest":
// {"state" | "conclusion", "url", "created_at"}}]}` — and paints a monitor
// glyph that goes red while anything is failing, with the failing count as the
// label. The card lists the ten most recent runs; a row opens the run.
//
// Point GITHUB_ACTIONS_FEED_URL at your own feed (or rewrite `fetchRuns` to
// call `gh api` — the widget contract doesn't care where the data comes from).
//
// Install: copy into ~/.config/launcharr/widgets/. Runs under Bun.
import type { WidgetTone, WidgetView } from '@launcharr/tui/bar/types'

const FEED_URL =
  process.env.GITHUB_ACTIONS_FEED_URL ??
  'https://0juxenscsxe5h3ff.public.blob.vercel-storage.com/glance/github-actions.json'
const HOME_URL =
  process.env.GITHUB_ACTIONS_HOME_URL ?? 'https://github.com/RamenAmok'
const MAX_ROWS = 10

const TONES: Record<string, WidgetTone> = {
  success: 'ok',
  failure: 'error',
  cancelled: 'error',
  timed_out: 'error',
  action_required: 'error',
  running: 'warn',
  queued: 'warn',
  in_progress: 'warn',
}

export type FeedItem = {
  repo_label?: string
  repo?: string
  workflow?: string
  workflow_url?: string
  repo_url?: string
  latest_state?: string
  sort_time?: string
  latest?: {
    name?: string
    state?: string
    conclusion?: string
    url?: string
    created_at?: string
  } | null
}

export type Feed = { failing?: number; items: FeedItem[] }

export function manifest() {
  return {
    id: 'github-actions',
    name: 'GitHub Actions',
    interval: 120,
    zone: 'right',
    icon: 'monitor-check',
    timeout: 15,
  }
}

/** '3m' / '2h' / '4d' since an ISO-8601 timestamp, or null. */
export function age(iso: string | undefined, now = Date.now()): string | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  const s = Math.max(0, Math.floor((now - t) / 1000))
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

/** The view for one feed — pure, so it's testable. */
export function view(feed: Feed, now = Date.now()): WidgetView {
  const runs = feed.items
    .filter((i) => i.latest && typeof i.latest === 'object')
    .map((i) => ({
      repo: i.repo_label ?? i.repo ?? 'repo',
      workflow: i.workflow ?? i.latest?.name ?? 'workflow',
      state:
        i.latest?.state ?? i.latest?.conclusion ?? i.latest_state ?? 'unknown',
      url: i.latest?.url ?? i.workflow_url ?? i.repo_url ?? HOME_URL,
      createdAt: i.latest?.created_at ?? i.sort_time ?? '',
    }))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  const failing =
    typeof feed.failing === 'number'
      ? feed.failing
      : runs.filter((r) => TONES[r.state] === 'error').length
  const running = runs.some((r) => TONES[r.state] === 'warn')
  return {
    icon: failing ? 'monitor-x' : 'monitor-check',
    label: failing ? String(failing) : null,
    tone: failing ? 'error' : running ? 'warn' : 'ok',
    click: { type: 'open', value: HOME_URL },
    card: {
      title: 'GitHub Actions',
      subtitle: failing ? `${failing} failing` : 'all green',
      rows: runs.slice(0, MAX_ROWS).map((r) => ({
        dot: TONES[r.state] ?? 'muted',
        text: `${r.repo} · ${r.workflow}`,
        hint: age(r.createdAt, now),
        action: { type: 'open' as const, value: r.url },
      })),
      hint: 'click a run to open it',
    },
  }
}

async function fetchRuns(): Promise<Feed> {
  const res = await fetch(FEED_URL, {
    headers: { 'User-Agent': 'launcharr-widget' },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`feed ${res.status}`)
  const feed: unknown = await res.json()
  if (
    !feed ||
    typeof feed !== 'object' ||
    !Array.isArray((feed as Feed).items)
  ) {
    throw new Error('feed is not {items: [...]}')
  }
  return feed as Feed
}

if (import.meta.main) {
  const cmd = process.argv[2]
  if (cmd === 'manifest') console.log(JSON.stringify(manifest()))
  else if (cmd === 'tick') {
    fetchRuns()
      .then((feed) => console.log(JSON.stringify(view(feed))))
      .catch((e) => {
        console.error(e instanceof Error ? e.message : String(e))
        process.exit(1)
      })
  } else {
    console.error('usage: github-actions.ts manifest|tick')
    process.exit(1)
  }
}
