import type { AgentSession, BarSnapshot } from '@launcharr/tui'

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
  { id: 'awake', title: 'Awake', hint: 'keep-alive sessions ▸' },
  { id: 'wifi', title: 'Wi-Fi', hint: 'networks & power ▸' },
  { id: 'dns', title: 'DNS', hint: 'network info ▸' },
  { id: 'audio', title: 'Audio', hint: 'volume & devices ▸' },
  { id: 'clipboard', title: 'Clipboard', hint: 'history & search ▸' },
  { id: 'screenshots', title: 'Screenshots', hint: 'latest captures ▸' },
  { id: 'aerospace', title: 'AeroSpace', hint: 'workspaces & tiling ▸' },
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
 * Fictional agent sessions, in the shape the app's Rust side pushes
 * (`AgentSession` from `@launcharr/tui`). The glyphs, colours, grouping and card
 * layout are the kit's — the website supplies data only (AGENTS invariant 10).
 *
 * `updatedAt` is epoch seconds, so the demo builds these relative to load time.
 */
export const AGENT_AGES: {
  agent: Omit<AgentSession, 'updatedAt'>
  age: number
}[] = [
  {
    age: 12,
    agent: {
      session: 'a1',
      agent: 'claude',
      state: 'working',
      title: 'refactor ranking tie-break',
      detail: 'reading packages/core/src/ranking.ts',
      mux: 'tmux',
      muxTarget: '%1',
      muxGroup: 'fable',
      muxIndex: 1,
      muxLabel: 'core',
      pid: null,
      pidComm: null,
    },
  },
  {
    age: 47,
    agent: {
      session: 'a2',
      agent: 'claude',
      state: 'attention',
      title: 'release v0.5.0 — awaiting approval',
      detail: 'permission needed: scripts/release.sh',
      mux: 'tmux',
      muxTarget: '%2',
      muxGroup: 'fable',
      muxIndex: 2,
      muxLabel: 'release',
      pid: null,
      pidComm: null,
    },
  },
  {
    age: 184,
    agent: {
      session: 'a3',
      agent: 'codex',
      state: 'done',
      title: 'usage panel — tests green',
      detail: '14 passed, 0 failed',
      mux: 'tmux',
      muxTarget: '%3',
      muxGroup: 'www',
      muxIndex: 1,
      muxLabel: 'panels',
      pid: null,
      pidComm: null,
    },
  },
  {
    age: 900,
    agent: {
      session: 'a4',
      agent: 'claude',
      state: 'idle',
      title: '',
      detail: 'waiting for a task',
      mux: 'tmux',
      muxTarget: '%4',
      muxGroup: 'www',
      muxIndex: 2,
      muxLabel: '',
      pid: null,
      pidComm: null,
    },
  },
]

/** Stamp the fictional ages against a real clock. */
export function demoAgents(nowSeconds: number): AgentSession[] {
  return AGENT_AGES.map(({ agent, age }) => ({
    ...agent,
    updatedAt: nowSeconds - age,
  }))
}

/** What the states mean — the legend beside the agent-monitoring section. */
export const AGENT_STATE_BLURBS: { state: string; blurb: string }[] = [
  { state: 'attention', blurb: 'needs you — breathes until you look' },
  { state: 'working', blurb: 'agent is mid-task' },
  { state: 'done', blurb: 'finished; marks read when you jump' },
  { state: 'idle', blurb: 'session open, nothing running' },
]

/** A full bar snapshot, exactly as bar.rs would push one. */
export function demoSnapshot(nowSeconds: number, focused: string): BarSnapshot {
  return {
    workspaces: ['1', '2', '3', '4'],
    focused,
    frontApp: 'Ghostty',
    batteryPct: 64,
    onAc: false,
    charging: false,
    wifi: { online: true, ssid: 'Blackbeard 5G' },
    agents: demoAgents(nowSeconds),
  }
}

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
    text: 'Scripts are the plugin API. Drop any executable into ~/.config/launcharr/scripts/ and it joins the grammar — no restart, no manifest file, no store.\n\nThe contract is two invocations:\n\n  <script> manifest      → {"trigger": "uuid", "name": "UUID"}\n  <script> query <args>  → {"items": [{"title": …, "action": …}]}\n\nAny language. stderr is ignored; a slow script gets killed, not waited for. json and ip ship bundled as reference implementations.',
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
