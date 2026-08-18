import { defineStories } from '@launcharr/tui'

import { type AgentSession, AgentsPanel } from './AgentsPanel'

const NOW = 1_800_000_000

const session = (over: Partial<AgentSession>): AgentSession => ({
  session: 'aaaa1111-2222-3333-4444-555566667777',
  agent: 'claude',
  state: 'working',
  title: 'Grow launcharr into an Omarchy-style bar',
  detail: 'PreToolUse · Bash',
  tmux: '%23',
  updatedAt: NOW - 42,
  tmuxSession: 'gogogo',
  tmuxWindow: 2,
  tmuxWindowName: 'Launcharr',
  pid: 4242,
  pidComm: 'claude',
  ...over,
})

const MIXED: AgentSession[] = [
  session({}),
  session({
    session: 'bbbb0000',
    state: 'attention',
    title: 'Release v0.5 — waiting on permission',
    detail: 'PermissionRequest',
    tmux: '%7',
    updatedAt: NOW - 5,
    tmuxWindow: 1,
    tmuxWindowName: 'Infisical',
  }),
  session({
    session: 'cccc0000',
    state: 'idle',
    title: 'Ensure CI is green and merge',
    detail: 'Stop',
    tmux: '%0',
    updatedAt: NOW - 7200,
    tmuxSession: 'ops',
    tmuxWindow: 1,
    tmuxWindowName: 'ci',
  }),
  session({
    session: 'dddd0000',
    state: 'done',
    title: 'Fix the Expo token',
    detail: 'Stop',
    tmux: '',
    updatedAt: NOW - 600,
    tmuxSession: null,
    tmuxWindow: null,
    tmuxWindowName: null,
  }),
]

const noop = () => {}

export const agentsPanelStories = defineStories('AgentsPanel (app)', [
  {
    name: 'mixed states',
    keys: '↵ jump · ⌫ dismiss · esc back',
    render: () => (
      <AgentsPanel
        sessions={MIXED}
        nowSecs={NOW}
        onJump={noop}
        onDismiss={noop}
        onClose={noop}
      />
    ),
  },
  {
    name: 'all quiet (idle only)',
    render: () => (
      <AgentsPanel
        sessions={MIXED.filter((s) => s.state === 'idle')}
        nowSecs={NOW}
        onJump={noop}
        onDismiss={noop}
        onClose={noop}
      />
    ),
  },
  {
    name: 'attention pile-up',
    render: () => (
      <AgentsPanel
        sessions={MIXED.map((s, i) => ({
          ...s,
          state: 'attention',
          session: `s${i}`,
        }))}
        nowSecs={NOW}
        onJump={noop}
        onDismiss={noop}
        onClose={noop}
      />
    ),
  },
  {
    name: 'empty',
    render: () => (
      <AgentsPanel
        sessions={[]}
        nowSecs={NOW}
        onJump={noop}
        onDismiss={noop}
        onClose={noop}
      />
    ),
  },
  {
    name: 'untitled session (id fallback)',
    render: () => (
      <AgentsPanel
        sessions={[session({ title: '', detail: 'SessionStart' })]}
        nowSecs={NOW}
        onJump={noop}
        onDismiss={noop}
        onClose={noop}
      />
    ),
  },
])
