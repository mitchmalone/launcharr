// launcharr widget: latest GitHub Actions run per repo (docs/WIDGETS.md).
//
// Credentials piggyback on the GitHub CLI (`gh auth token` — gh keeps its own
// token fresh), or a pasted GITHUB_TOKEN setting overrides it. No CLI and no
// token → the cell goes dim with the fix (`gh auth login`) in the card and in
// Settings — alerted, never silently blank (Mitch, 2026-08-20). The `auth`
// device flow is still here but dormant: it lights up only when a CLIENT_ID
// for a launcharr OAuth App is baked in below.
//
// Each tick: the ten repos you pushed to most recently (edit REPOS below to
// pin a list) and each one's latest workflow run. The cell is a monitor, red
// with the failing count while anything is failing, amber while something
// runs; the card lists runs newest first.
//
// Install: copy into ~/.config/launcharr/widgets/. Runs under Bun.
import type { WidgetTone, WidgetView } from '@launcharr/tui/bar/types'

/** Thrown when the fix is the user's, not the widget's — becomes `setup`. */
class SetupNeeded extends Error {
  fix: string
  constructor(message: string, fix: string) {
    super(message)
    this.fix = fix
  }
}

const API = 'https://api.github.com'
const MAX_ROWS = 10
const DEFAULT_REPOS = 10
/** Pin repos here (`owner/repo`); empty = your most recently pushed. */
const REPOS: string[] = []
/**
 * launcharr's GitHub OAuth App (device flow enabled). A client id is public —
 * it names the app the user is approving, nothing more. Fill in once the app
 * is registered; until then sign-in explains itself. Override for a fork with
 * GITHUB_CLIENT_ID in the environment.
 */
const CLIENT_ID = process.env.GITHUB_CLIENT_ID ?? ''

const TONES: Record<string, WidgetTone> = {
  success: 'ok',
  failure: 'error',
  cancelled: 'error',
  timed_out: 'error',
  action_required: 'error',
  startup_failure: 'error',
  queued: 'warn',
  waiting: 'warn',
  pending: 'warn',
  requested: 'warn',
  in_progress: 'warn',
}

/** One repo's latest run, as `view` wants it. */
export type RunItem = {
  repo: string
  workflow: string
  /** `conclusion` once completed, else `status` (queued, in_progress, …). */
  state: string
  url: string
  createdAt: string
}

export function manifest() {
  return {
    id: 'github-actions',
    name: 'GitHub Actions',
    interval: 120,
    zone: 'right',
    icon: 'monitor-check',
    timeout: 20,
    settings: [
      {
        key: 'GITHUB_TOKEN',
        label: 'GitHub',
        hint: 'optional — a token to use instead of the GitHub CLI',
        secret: true,
      },
    ],
    requires: [
      {
        label: 'GitHub CLI, signed in (or a pasted token)',
        fix: 'brew install gh && gh auth login',
      },
    ],
    // No client id baked in (a fork, a dev build) → no sign-in button at all;
    // the token row alone is the honest UI.
    ...(CLIENT_ID ? { auth: { label: 'Sign in with GitHub' } } : {}),
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

/** The view for a set of latest runs — pure, so it's testable. */
export function view(
  items: RunItem[],
  home = 'https://github.com',
  now = Date.now(),
): WidgetView {
  const runs = [...items].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  const failing = runs.filter((r) => TONES[r.state] === 'error').length
  const running = runs.some((r) => TONES[r.state] === 'warn')
  return {
    icon: failing ? 'monitor-x' : 'monitor-check',
    label: failing ? String(failing) : null,
    tone: failing ? 'error' : running ? 'warn' : 'ok',
    click: { type: 'open', value: home },
    card: {
      title: 'GitHub Actions',
      subtitle: failing
        ? `${failing} failing`
        : runs.length
          ? 'all green'
          : 'no runs',
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

/** `owner/repo,owner/repo` → trimmed, deduped, empties dropped. */
export function parseRepos(raw: string | undefined): string[] {
  return [
    ...new Set(
      (raw ?? '')
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter((s) => /^[\w.-]+\/[\w.-]+$/.test(s)),
    ),
  ]
}

async function gh<T>(path: string, token: string): Promise<T> {
  const res = await fetch(API + path, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'launcharr-widget',
    },
    signal: AbortSignal.timeout(12000),
  })
  if (res.status === 401) {
    throw new SetupNeeded(
      'GitHub rejected the credentials — sign in again',
      'gh auth login',
    )
  }
  if (!res.ok) throw new Error(`github api ${res.status} on ${path}`)
  return (await res.json()) as T
}

type Repo = { full_name: string; html_url?: string }
type WorkflowRun = {
  name?: string
  status?: string
  conclusion?: string | null
  html_url?: string
  created_at?: string
}

/**
 * The GitHub CLI's token — gh refreshes its own credential store. Launched
 * from Finder, launcharr's PATH is bare, so the usual homes are probed too.
 */
async function ghCliToken(): Promise<string | null> {
  const candidates = ['gh', '/opt/homebrew/bin/gh', '/usr/local/bin/gh']
  for (const gh of candidates) {
    try {
      const proc = Bun.spawn([gh, 'auth', 'token'], {
        stdout: 'pipe',
        stderr: 'ignore',
      })
      const out = await new Response(proc.stdout).text()
      if ((await proc.exited) === 0 && out.trim()) return out.trim()
    } catch {
      // not at this path — try the next
    }
  }
  return null
}

async function tick(): Promise<WidgetView> {
  const token = process.env.GITHUB_TOKEN ?? (await ghCliToken())
  if (!token) {
    return {
      setup: {
        message: 'no GitHub credentials — sign in with the GitHub CLI',
        fix: 'gh auth login',
      },
    }
  }
  let repos = parseRepos(REPOS.join(','))
  if (!repos.length) {
    const mine = await gh<Repo[]>(
      `/user/repos?sort=pushed&per_page=${DEFAULT_REPOS}&affiliation=owner,collaborator,organization_member`,
      token,
    )
    repos = mine.map((r) => r.full_name)
  }
  const items = await Promise.all(
    repos.map(async (repo): Promise<RunItem | null> => {
      const { workflow_runs } = await gh<{ workflow_runs: WorkflowRun[] }>(
        `/repos/${repo}/actions/runs?per_page=1`,
        token,
      )
      const run = workflow_runs?.[0]
      if (!run) return null
      return {
        repo,
        workflow: run.name ?? 'workflow',
        state:
          run.status === 'completed'
            ? (run.conclusion ?? 'unknown')
            : (run.status ?? 'unknown'),
        url: run.html_url ?? `https://github.com/${repo}/actions`,
        createdAt: run.created_at ?? '',
      }
    }),
  )
  const me = await gh<{ login?: string }>('/user', token)
  const home = me.login
    ? `https://github.com/${me.login}?tab=repositories`
    : 'https://github.com'
  return view(
    items.filter((i): i is RunItem => i != null),
    home,
  )
}

/** A line of the auth protocol (widgets.rs): printed as one JSON object. */
function say(obj: Record<string, unknown>) {
  console.log(JSON.stringify(obj))
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * GitHub's OAuth device flow (docs.github.com → "Authorizing OAuth apps" →
 * device flow): ask for a code, show it, poll until the user approves, hand
 * the token back to launcharr as a secret setting.
 */
async function auth(): Promise<void> {
  const clientId = CLIENT_ID
  if (!clientId) {
    throw new Error(
      'this build has no GitHub OAuth client id yet — paste a token instead',
    )
  }
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': 'launcharr-widget',
  }
  const start = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers,
    body: JSON.stringify({ client_id: clientId, scope: 'repo' }),
    signal: AbortSignal.timeout(12000),
  })
  if (!start.ok) throw new Error(`device code request failed (${start.status})`)
  const dev = (await start.json()) as {
    device_code?: string
    user_code?: string
    verification_uri?: string
    interval?: number
    expires_in?: number
    error?: string
    error_description?: string
  }
  if (!dev.device_code || !dev.user_code) {
    throw new Error(dev.error_description ?? dev.error ?? 'no device code')
  }
  say({
    url: dev.verification_uri ?? 'https://github.com/login/device',
    code: dev.user_code,
  })
  let interval = (dev.interval ?? 5) * 1000
  const deadline = Date.now() + (dev.expires_in ?? 900) * 1000
  while (Date.now() < deadline) {
    await sleep(interval)
    const poll = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        client_id: clientId,
        device_code: dev.device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
      signal: AbortSignal.timeout(12000),
    })
    const body = (await poll.json()) as {
      access_token?: string
      error?: string
      error_description?: string
    }
    if (body.access_token) {
      say({ settings: { GITHUB_TOKEN: body.access_token } })
      return
    }
    switch (body.error) {
      case 'authorization_pending':
        continue
      case 'slow_down':
        interval += 5000
        continue
      case 'expired_token':
        throw new Error('the code expired — sign in again')
      case 'access_denied':
        throw new Error('sign-in was cancelled on GitHub')
      default:
        throw new Error(
          body.error_description ?? body.error ?? 'sign-in failed',
        )
    }
  }
  throw new Error('the code expired — sign in again')
}

if (import.meta.main) {
  const cmd = process.argv[2]
  const fail = (e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e))
    process.exit(1)
  }
  if (cmd === 'manifest') console.log(JSON.stringify(manifest()))
  else if (cmd === 'tick') {
    tick()
      .then((v) => console.log(JSON.stringify(v)))
      .catch((e) => {
        if (e instanceof SetupNeeded) {
          console.log(
            JSON.stringify({ setup: { message: e.message, fix: e.fix } }),
          )
        } else fail(e)
      })
  } else if (cmd === 'auth') {
    auth().catch(fail)
  } else {
    console.error('usage: github-actions.ts manifest|tick|auth')
    process.exit(1)
  }
}
