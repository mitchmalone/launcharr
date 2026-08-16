/**
 * Mock payloads for the website demo. Shapes mirror what the app's Rust side pushes
 * (wifi.rs, usage.rs, the agent socket monitor) so the demo panels are the real
 * `@launcharr/tui` components fed plausible data — the website has no OS behind it.
 *
 * Nothing here is engine logic: grammar, matching and ranking all run in
 * `@launcharr/core` (invariant 5). This file is data only.
 */

/** The panel registry, mirrored from the app's `src/panels/registry.ts`. */
export const PANEL_INFO = [
  { id: 'agents', title: 'Agents', hint: 'coding agent sessions ▸' },
  { id: 'usage', title: 'Usage', hint: 'token monitor ▸' },
  { id: 'wifi', title: 'Wi-Fi', hint: 'networks & power ▸' },
  { id: 'dns', title: 'DNS', hint: 'network info ▸' },
  { id: 'audio', title: 'Audio', hint: 'volume & devices ▸' },
  { id: 'clipboard', title: 'Clipboard', hint: 'history & search ▸' },
  { id: 'help', title: 'Help', hint: 'commands & keys ▸' },
] as const

export type PanelId = (typeof PANEL_INFO)[number]['id']

/** Panels the demo actually drives; the rest explain themselves and point at the app. */
export const INTERACTIVE_PANELS: PanelId[] = ['wifi', 'dns', 'usage']

export const WIFI = {
  status: {
    iface: 'en0',
    ssid: 'Blackbeard 5G',
    ip: '192.168.1.42',
    router: '192.168.1.1',
    dns: '100.100.100.100',
  },
  known: ['Blackbeard 5G', 'Blackbeard', "Crow's Nest", 'Tortuga Guest'],
  scanned: [
    { ssid: 'NETGEAR-7C', secured: true },
    { ssid: "Dead Man's Wifi", secured: true },
    { ssid: 'xfinitywifi', secured: false },
  ],
}

export type UsageProvider = {
  label: string
  limits: { name: string; pct: number; resets: string }[]
  days: { label: string; tokens: number }[]
  models: { model: string; tokens: number }[]
}

export const USAGE: Record<'claude' | 'codex', UsageProvider> = {
  claude: {
    label: 'Claude Code',
    limits: [
      { name: '5h window', pct: 59, resets: 'resets in 2h' },
      { name: 'Weekly', pct: 34, resets: 'resets in 4d' },
      { name: 'Weekly (Opus)', pct: 12, resets: 'resets in 4d' },
    ],
    days: [
      { label: 'Sun', tokens: 61.2e6 },
      { label: 'Mon', tokens: 148.4e6 },
      { label: 'Tue', tokens: 94.1e6 },
      { label: 'Wed', tokens: 212.7e6 },
      { label: 'Thu', tokens: 176.3e6 },
      { label: 'Fri', tokens: 118.9e6 },
      { label: 'Today', tokens: 87.5e6 },
    ],
    models: [
      { model: 'claude-sonnet-4-5', tokens: 611.4e6 },
      { model: 'claude-opus-4-1', tokens: 236.2e6 },
      { model: 'claude-haiku-4-5', tokens: 51.5e6 },
    ],
  },
  codex: {
    label: 'Codex',
    limits: [{ name: 'Weekly', pct: 8, resets: 'resets in 6d' }],
    days: [
      { label: 'Sun', tokens: 4.1e6 },
      { label: 'Mon', tokens: 12.6e6 },
      { label: 'Tue', tokens: 0 },
      { label: 'Wed', tokens: 22.9e6 },
      { label: 'Thu', tokens: 8.3e6 },
      { label: 'Fri', tokens: 15.2e6 },
      { label: 'Today', tokens: 3.8e6 },
    ],
    models: [{ model: 'gpt-5-codex', tokens: 66.9e6 }],
  },
}

export function fmtTokens(n: number): string {
  const s = (v: number, u: string) => v.toFixed(1).replace(/\.0$/, '') + u
  if (n >= 1e9) return s(n / 1e9, 'B')
  if (n >= 1e6) return s(n / 1e6, 'M')
  if (n >= 1e3) return s(n / 1e3, 'k')
  return String(n)
}

/**
 * Wire states, verbatim from `AgentSession.state` in apps/desktop/src/bar/main.tsx.
 * `attention` is the wire name; "blocked" is only its display label — the app keeps
 * that split in AGENT_STATE_LABELS and so do we.
 */
export type AgentState = 'attention' | 'working' | 'done' | 'idle'

/**
 * Cell appearance per state, ported from `.bar-agent-*` in bar/bar.css. The three
 * literal hexes are literal there too; `working` resolves to the *theme* accent, so
 * it retints with the theme picker exactly as the real bar does.
 */
export const AGENT_STATES: Record<
  AgentState,
  { glyph: string; color: string; label: string; blurb: string }
> = {
  attention: {
    glyph: '◉',
    color: '#ff2d2d',
    label: 'blocked',
    blurb: 'needs you — breathes until you look',
  },
  working: {
    glyph: '●',
    // bar.css says var(--accent); --d-accent is the demo's scoped mirror of it
    // (the page's own --accent is the max-contrast foreground, not the theme's).
    color: 'var(--d-accent)',
    label: 'working',
    blurb: 'agent is mid-task',
  },
  done: {
    glyph: '●',
    color: '#00b0ff',
    label: 'done · unread',
    blurb: 'finished; marks read when you jump',
  },
  idle: {
    glyph: '○',
    color: '#00c853',
    label: 'idle',
    blurb: 'session open, nothing running',
  },
}

/** Shaped like `AgentSession` in bar/main.tsx, minus the fields the card never reads. */
export type Agent = {
  session: string
  agent: string
  state: AgentState
  title: string
  detail: string
  tmuxSession: string | null
  tmuxWindow: number
  tmuxWindowName: string
  /** Seconds since the last update — the card renders "· Ns ago". */
  age: number
}

export const AGENTS: Agent[] = [
  {
    session: 'a1',
    agent: 'claude',
    state: 'working',
    title: 'refactor ranking tie-break',
    detail: 'reading packages/core/src/ranking.ts',
    tmuxSession: 'fable',
    tmuxWindow: 1,
    tmuxWindowName: 'core',
    age: 12,
  },
  {
    session: 'a2',
    agent: 'claude',
    state: 'attention',
    title: 'release v0.5.0 — awaiting approval',
    detail: 'permission needed: scripts/release.sh',
    tmuxSession: 'fable',
    tmuxWindow: 2,
    tmuxWindowName: 'release',
    age: 47,
  },
  {
    session: 'a3',
    agent: 'codex',
    state: 'done',
    title: 'usage panel — tests green',
    detail: '14 passed, 0 failed',
    tmuxSession: 'www',
    tmuxWindow: 1,
    tmuxWindowName: 'panels',
    age: 184,
  },
  {
    session: 'a4',
    agent: 'claude',
    state: 'idle',
    title: '',
    detail: 'waiting for a task',
    tmuxSession: 'www',
    tmuxWindow: 2,
    tmuxWindowName: '',
    age: 900,
  },
]

/** `agentAge` from bar/main.tsx — same thresholds, same rounding. */
export function agentAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  return `${Math.round(seconds / 3600)}h`
}

/** The tmux line the card prints, or its no-pane fallback. */
export function agentTmuxLine(a: Agent): string {
  if (!a.tmuxSession) return 'no tmux pane'
  return (
    `${a.tmuxSession} · tab ${a.tmuxWindow}` +
    (a.tmuxWindowName ? ` · ${a.tmuxWindowName}` : '')
  )
}

/**
 * `groupAgents` from bar/main.tsx: tmux-session groups ordered by name with
 * cells ordered by tab index, then loose cells for agents outside tmux —
 * invocation order never decides placement.
 */
export const AGENT_GROUPS: Agent[][] = (() => {
  const byName = new Map<string, Agent[]>()
  for (const a of AGENTS) {
    if (!a.tmuxSession) continue
    const list = byName.get(a.tmuxSession) ?? []
    list.push(a)
    byName.set(a.tmuxSession, list)
  }
  for (const list of byName.values()) {
    list.sort(
      (x, y) =>
        x.tmuxWindow - y.tmuxWindow || x.session.localeCompare(y.session),
    )
  }
  return [...byName.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, list]) => list)
})()

/**
 * Canned `?` answers. The real thing streams from the user's own claude/codex CLI
 * in a caged child process; a static site has no CLI, so it says so.
 */
export const ASK_ANSWERS: { match: RegExp; text: string }[] = [
  {
    match: /quicklink/i,
    text: 'Quicklinks are trigger words bound to URL templates. Type a URL in the panel and choose "Add quicklink…" — you pick a name, a browser, and launcharr fetches the favicon (the one network request the launcher core ever makes, and only because you asked).\n\nA {query} placeholder makes it Raycast-style:\n\n  yt cute otters ⏎   → youtube.com/results?search_query=cute+otters\n  gh tauri ⏎         → github.com/search?q=tauri\n\nA bare trigger opens the site itself. Triggers are whole-word only, so typing "yt" mid-search never hijacks a fuzzy match.',
  },
  {
    match: /script|hack|extend|plugin/i,
    text: 'Scripts are the plugin API. Drop any executable into ~/.config/launcharr/scripts/ and it joins the grammar — no restart, no manifest file, no store.\n\nThe contract is two invocations:\n\n  <script> manifest      → {"trigger": "lorem", "name": "Lorem ipsum"}\n  <script> query <args>  → {"items": [{"title": …, "action": …}]}\n\nAny language. stderr is ignored; a slow script gets killed, not waited for. lorem, json and ip ship bundled as reference implementations.',
  },
  {
    match: /bar|menubar/i,
    text: "The bar is launcharr's menubar replacement — an Omarchy-flat strip: no boxes, dim glyphs, one solid block marking the active workspace.\n\nModules live in explicit left / center / right zones under bar.layout in config.json, ordered within each zone. Notched displays get their own arrangement, since the camera housing owns the middle. The whole strip costs ~19 MB marginal memory and is themed by the same tokens as the launcher.",
  },
  {
    match: /.*/,
    text: 'This is agent mode: press ? and the key flips the mode. In the real app your question streams to your own claude or codex CLI, running as a caged child — empty cwd, no filesystem or exec tools — and the answer renders right here in the panel.\n\nIt\'s off by default (Settings → Agents → "Enable agent mode"). Esc ends the conversation and puts focus back exactly where it was.\n\nThe website demo has no CLI behind it, so you get this canned answer instead. Yarr.',
  },
]

export function askAnswer(prompt: string): string {
  return ASK_ANSWERS.find((a) => a.match.test(prompt))?.text ?? ''
}
