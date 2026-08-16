import { BUILTIN_THEMES } from '@launcharr/tui/themes'
import {
  AppWindow,
  ArrowUpRight,
  Bot,
  ChevronRight,
  ClipboardList,
  FileCode2,
  Gauge,
  MessageCircleQuestion,
  Palette,
  PanelTop,
  Play,
  Settings,
  ShieldCheck,
  SquareTerminal,
  Star,
  Tag,
  Terminal,
} from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

import { AgentSpotlight } from '@/components/agent-spotlight'
import { BarStrip } from '@/components/bar-strip'
import { GithubIcon, XIcon } from '@/components/brand-icons'
import { Demo } from '@/components/demo/demo'
import { InstallTabs } from '@/components/install-tabs'
import { SiteHeader } from '@/components/site-header'
import { Badge } from '@/components/ui/badge'
import { ButtonLink } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { AGENT_STATES } from '@/lib/demo-data'
import { GITHUB_URL, RELEASE, RELEASES_URL, VERSION } from '@/lib/site'

const LAUNCHARR_THEME = BUILTIN_THEMES.launcharr!

const MONO_CODE = 'font-mono text-(--fg)'
const SECTION = 'mx-auto max-w-[1080px] px-8'
const EYEBROW =
  'm-0 text-[13px] font-medium uppercase tracking-[0.14em] text-(--dim)'
const PROSE = 'font-sans text-[17px] leading-[1.6] text-(--body) text-pretty'
const CARD_BODY = 'font-sans text-sm leading-[1.6] text-(--muted)'

const FEATURES = [
  {
    icon: <ChevronRight size={22} strokeWidth={2} className="text-(--green)" />,
    title: 'Launch, fuzzy & frecency-ranked',
    body: (
      <>
        Apps and System Settings panes, scored fzf-family and ranked by your
        actual usage. Ties break on frecency, never the other way around.
      </>
    ),
  },
  {
    icon: (
      <SquareTerminal size={22} strokeWidth={1.75} className="text-(--amber)" />
    ),
    title: 'Bang mode to your terminal',
    body: (
      <>
        <code className={MONO_CODE}>!git status ⏎</code> hands the command to
        iTerm2 or Terminal.app, verbatim. No wrapper, no escaping surprises.
      </>
    ),
  },
  {
    icon: (
      <FileCode2 size={22} strokeWidth={1.75} className="text-(--accent)" />
    ),
    title: 'Hackable in any language',
    body: (
      <>
        Drop an executable in{' '}
        <code className={MONO_CODE}>~/.config/launcharr/scripts/</code> — its
        trigger word is live before you switch back to the panel.{' '}
        <code className={MONO_CODE}>lorem</code>,{' '}
        <code className={MONO_CODE}>json</code> and{' '}
        <code className={MONO_CODE}>ip</code> ship bundled.
      </>
    ),
  },
  {
    icon: (
      <ClipboardList size={22} strokeWidth={1.75} className="text-(--dim)" />
    ),
    title: 'Clipboard, math, emoji',
    body: (
      <>
        <code className={MONO_CODE}>clip</code> keeps 200 text items and never
        records concealed types. <code className={MONO_CODE}>2*(14.5+3)</code>{' '}
        computes inline; <code className={MONO_CODE}>:fire</code> picks emoji.
        Enter copies.
      </>
    ),
  },
  {
    icon: (
      <ArrowUpRight size={22} strokeWidth={1.75} className="text-(--dim)" />
    ),
    title: 'Quicklinks & URLs',
    body: (
      <>
        Type a URL to open it, or add it in-panel with a name, browser and
        favicon. <code className={MONO_CODE}>{'{query}'}</code> templates give
        you <code className={MONO_CODE}>yt cute otters ⏎</code>.
      </>
    ),
  },
  {
    icon: <Settings size={22} strokeWidth={1.75} className="text-(--dim)" />,
    title: 'Settings you can edit by hand',
    body: (
      <>
        A real settings window and a watched, hot-applied{' '}
        <code className={MONO_CODE}>config.json</code>. Both stay in sync;
        neither is the second-class citizen.
      </>
    ),
  },
  {
    icon: <PanelTop size={22} strokeWidth={1.75} className="text-(--cta)" />,
    milestone: true,
    title: 'The bar',
    body: (
      <>
        An Omarchy-flat menubar replacement: no boxes, dim glyphs, one solid
        block on the active workspace. ~19&nbsp;MB marginal memory, themed by
        the same tokens as the launcher.
      </>
    ),
  },
  {
    icon: <AppWindow size={22} strokeWidth={1.75} className="text-(--cta)" />,
    milestone: true,
    title: 'TUI panels in the launcher',
    body: (
      <>
        <code className={MONO_CODE}>wifi ⏎</code>,{' '}
        <code className={MONO_CODE}>dns ⏎</code>,{' '}
        <code className={MONO_CODE}>usage ⏎</code> and more — keyboard-driven
        panels inside the launcher window. Esc walks back; focus returns exactly
        where it was.
      </>
    ),
  },
  {
    icon: <Bot size={22} strokeWidth={1.75} className="text-(--green)" />,
    milestone: true,
    title: 'Agent monitoring',
    body: (
      <>
        Claude and Codex sessions as bar cells, boxed by tmux session, ordered
        by tab. Blocked breathes red; click a cell to jump straight to the pane.
      </>
    ),
  },
  {
    icon: <Gauge size={22} strokeWidth={1.75} className="text-(--dim)" />,
    milestone: true,
    title: 'Token usage, locally',
    body: (
      <>
        <code className={MONO_CODE}>usage ⏎</code> parses agent journals on
        disk: tokens by day and model, plus opt-in account limits with reset
        countdowns. No token refresh, ever.
      </>
    ),
  },
  {
    icon: (
      <MessageCircleQuestion
        size={22}
        strokeWidth={1.75}
        className="text-(--dim)"
      />
    ),
    milestone: true,
    title: '? agent mode',
    body: (
      <>
        Press <code className={MONO_CODE}>?</code> and ask — streamed answers
        from your own <code className={MONO_CODE}>claude</code> or{' '}
        <code className={MONO_CODE}>codex</code> CLI in a caged child process.
        Off by default.
      </>
    ),
  },
  {
    icon: <Palette size={22} strokeWidth={1.75} className="text-(--dim)" />,
    title: '14 themes, JSON overlays',
    body: (
      <>
        From gruvbox to rose-pine, launcher and bar together. Custom themes are
        plain JSON token overlays in{' '}
        <code className={MONO_CODE}>config.json</code>.
      </>
    ),
  },
  {
    icon: (
      <ShieldCheck size={22} strokeWidth={1.75} className="text-(--green)" />
    ),
    title: 'Zero permissions, opt-in everything',
    body: (
      <>
        No Accessibility, no Full Disk Access, no telemetry, no update pings.
        The launcher core's only network call is user-initiated: fetching a
        favicon the moment you add a quicklink.
      </>
    ),
  },
]

/** Every number here traces to a measurement in docs/JOURNAL.md or docs/ROADMAP.md. */
const STATS = [
  { value: '3.7ms', label: 'measured summon — the budget is 100ms' },
  { value: '~96MB', label: 'main-process RSS while idling invisibly' },
  { value: '+19MB', label: 'marginal memory for the whole bar' },
  { value: '0', label: 'permissions launcharr asks you to grant' },
]

const BAR_MODULES = [
  {
    name: 'workspaces',
    body: 'Aerospace workspaces, clickable and hotkey-tracked. The solid block is where you are.',
  },
  {
    name: 'agents',
    body: 'Claude/Codex session cells, boxed by tmux session. Hover for the task; click to jump.',
  },
  {
    name: 'front app',
    body: 'The focused application, dim and truncated at 32ch. Never shouts.',
  },
  {
    name: 'clock',
    body: 'An ordinary module that usually sits in the center zone — move it wherever you like.',
  },
  {
    name: 'wifi · trmnl · battery',
    body: 'Right-zone glyph cells. Alert states go amber, then red. Fail-soft: a module with no data hides, never errors.',
  },
  {
    name: 'yours (module API)',
    body: 'A data-driven, any-language emitter API is on the v0.5 roadmap — same contract philosophy as scripts.',
  },
]

const COMPARISON = {
  columns: ['launcharr', 'Raycast', 'Alfred', 'Sketchybar'],
  rows: [
    [
      'feels like',
      'a shell prompt',
      'a polished app',
      'a polished app',
      'a status bar',
    ],
    [
      'extensions',
      'any executable in a folder',
      'React + a store',
      'workflows',
      'shell plugins',
    ],
    ['menubar replacement', 'yes — bar + launcher', 'no', 'no', 'bar only'],
    [
      'license',
      'MIT, open source',
      'closed, freemium',
      'closed, paid Powerpack',
      'open source',
    ],
  ],
}

const ROADMAP = [
  ['done', 'TUI kit', 'panels, rows, hotkeys, themes'],
  ['done', 'Bar spike', '~19MB marginal — gate passed'],
  ['done', 'Panel framework', 'wifi ⏎ · dns ⏎ and five more'],
  ['done', 'tui workbench', 'story-driven state coverage'],
  ['wip', 'Bar core', 'daily driver; placement config pending'],
  ['wip', 'Agent monitoring', 'shipped; module API pending'],
  ['todo', 'Aerospace wrap', 'tiling without seeing a .toml'],
  ['todo', 'Settings into panels', 'the native window retires'],
] as const

const MARK = {
  done: { glyph: '✓', className: 'text-(--green)' },
  wip: { glyph: '◐', className: 'text-(--amber)' },
  todo: { glyph: '○', className: 'text-(--dim2)' },
}

export default function Home() {
  return (
    <div className="min-h-screen bg-(--bg) text-(--fg)">
      <SiteHeader />

      {/* ---- hero ---- */}
      <section
        className={`${SECTION} grid justify-items-start gap-[26px] pb-10 pt-[72px]`}
      >
        <Badge variant="eyebrow">
          <span className="size-1.5 rounded-full bg-(--green)" />
          macOS · Apple Silicon · free &amp; open source
        </Badge>
        <h1 className="m-0 max-w-[17ch] text-[clamp(2.25rem,7vw,3.625rem)] font-bold leading-[1.05] tracking-[-0.035em] text-balance">
          The keyboard control surface for macOS.
        </h1>
        <p
          className={`m-0 max-w-[64ch] font-sans text-[19px] leading-[1.6] text-(--body) text-pretty`}
        >
          launcharr started as an app launcher that dresses up as a shell
          prompt. It has kept growing: a full menubar replacement in the Omarchy
          mold, keyboard-driven TUI panels, agent monitoring, and a grammar you
          extend by dropping executables in a folder. Hit{' '}
          <kbd className="rounded-[5px] border border-b-2 border-(--border) px-1.5 py-px text-[15px] text-(--fg)">
            ⌥Space
          </kbd>{' '}
          and run your Mac without touching the mouse.
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          {RELEASE.artifacts ? (
            <ButtonLink
              variant="cta"
              size="lg"
              href={RELEASE.artifacts.dmg.url}
            >
              <Terminal size={16} strokeWidth={2} />
              Download for Mac
            </ButtonLink>
          ) : null}
          <ButtonLink variant="outline" size="lg" href={GITHUB_URL}>
            <Star size={16} strokeWidth={1.75} />
            Star on GitHub
          </ButtonLink>
          <span className="text-[12.5px] text-(--dim2)">
            {VERSION} · Apple Silicon
            {RELEASE.signed ? ' · signed & notarized' : null}
          </span>
        </div>

        {/* welcome video drops in here — placeholder frame until footage exists */}
        <div className="mt-6 w-full">
          <div
            className="flex aspect-video flex-col items-center justify-center gap-[18px] rounded-[14px] border border-(--hair)"
            style={{
              boxShadow: 'var(--shadow)',
              background:
                'repeating-linear-gradient(-45deg, #11131d 0, #11131d 14px, #14161f 14px, #14161f 28px)',
            }}
          >
            <span className="inline-flex size-[68px] items-center justify-center rounded-full border border-[#393b54] bg-[rgba(28,29,42,0.8)] text-(--cta)">
              <Play size={26} strokeWidth={2} />
            </span>
            <span className="text-[12.5px] text-[#7d8590]">
              welcome video — coming soon
            </span>
          </div>
        </div>
      </section>

      {/* ---- live demo ---- */}
      <section id="demo" className={`${SECTION} pb-24 pt-10`}>
        <h2 className={`${EYEBROW} mb-6`}>
          This is not a screenshot — type in it
        </h2>
        <Demo />
      </section>

      {/* ---- features ---- */}
      <section id="features" className={`${SECTION} pb-24`}>
        <h2 className={`${EYEBROW} mb-6`}>What it does</h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-px overflow-hidden rounded-xl border border-(--hair) bg-(--hair)">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="grid content-start gap-2.5 bg-(--bg) px-6 py-[26px]"
            >
              {f.milestone ? (
                <div className="flex items-center justify-between">
                  {f.icon}
                  <Badge variant="milestone">V0.5</Badge>
                </div>
              ) : (
                f.icon
              )}
              <h3 className="m-0 text-[15px] font-semibold">{f.title}</h3>
              <p className={`m-0 ${CARD_BODY}`}>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---- stats ---- */}
      <section className="border-y border-(--hair) bg-(--bg2)">
        <div
          className={`${SECTION} grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-10 py-14`}
        >
          {STATS.map((s) => (
            <div key={s.label} className="grid gap-2">
              <span className="text-[38px] font-bold tracking-[-0.03em]">
                {s.value}
              </span>
              <span className="text-[13px] text-(--muted)">{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ---- the bar ---- */}
      <section id="bar" className={`${SECTION} py-24`}>
        <div className="mb-7 grid max-w-[70ch] gap-4">
          <h2 className={EYEBROW}>The bar — your menubar, replaced</h2>
          <p className={`m-0 ${PROSE}`}>
            One flat 30px strip, inspired by Omarchy: no boxes, dim glyphs, a
            solid block marking the active workspace. Modules live in explicit{' '}
            <code className={MONO_CODE}>left</code> /{' '}
            <code className={MONO_CODE}>center</code> /{' '}
            <code className={MONO_CODE}>right</code> zones under{' '}
            <code className={MONO_CODE}>bar.layout</code>, and notched displays
            get their own arrangement. Rust pushes snapshots at 1&nbsp;Hz — the
            webview is a pure listener.
          </p>
        </div>
        <BarStrip />
        <div className="mt-7 grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-px overflow-hidden rounded-xl border border-(--hair) bg-(--hair)">
          {BAR_MODULES.map((m) => (
            <div key={m.name} className="grid gap-1.5 bg-(--bg) px-[22px] py-5">
              <span className="text-[13px] font-semibold">{m.name}</span>
              <span className="font-sans text-[13px] leading-[1.55] text-(--muted)">
                {m.body}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ---- agent monitoring ---- */}
      <section id="agents" className="border-t border-(--hair) bg-(--bg2)">
        <div
          className={`${SECTION} grid items-start gap-16 py-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]`}
        >
          <div className="grid gap-4">
            <h2 className={EYEBROW}>Agent monitoring</h2>
            <p className={`m-0 ${PROSE}`}>
              If you run coding agents in tmux all day, the bar is their status
              board. Every session is one glyph, grouped by tmux session and
              ordered by tab. Hover a cell for the task and state; click it and
              launcharr drops you into the exact pane.
            </p>
            <div
              className="mt-2 grid gap-2.5 text-[13px]"
              /* `working` resolves to the theme accent, as the bar does. */
              style={
                { '--d-accent': LAUNCHARR_THEME.accent } as React.CSSProperties
              }
            >
              {(['attention', 'working', 'done', 'idle'] as const).map(
                (state) => {
                  const s = AGENT_STATES[state]
                  return (
                    <div key={state} className="flex items-center gap-3">
                      <span
                        style={{
                          color: s.color,
                          animation:
                            state === 'attention'
                              ? 'bar-agent-breathe 1.6s ease-in-out infinite'
                              : undefined,
                        }}
                      >
                        {s.glyph}
                      </span>
                      <span className="min-w-[12ch] text-(--fg)">
                        {s.label}
                      </span>
                      <span className="text-(--muted)">{s.blurb}</span>
                    </div>
                  )
                },
              )}
            </div>
          </div>
          <AgentSpotlight />
        </div>
      </section>

      {/* ---- comparison ---- */}
      <section id="compare" className={`${SECTION} py-24`}>
        <h2 className={`${EYEBROW} mb-6`}>Picking a launcher</h2>
        <div className="overflow-hidden rounded-xl border border-(--hair)">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead />
                {COMPARISON.columns.map((c, i) => (
                  <TableHead
                    key={c}
                    className={i === 0 ? 'font-bold text-(--fg)' : undefined}
                  >
                    {c}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {COMPARISON.rows.map(([label, ...cells]) => (
                <TableRow key={label}>
                  <TableCell>{label}</TableCell>
                  {cells.map((cell, i) => (
                    <TableCell
                      key={i}
                      className={i === 0 ? 'text-(--fg)' : undefined}
                    >
                      {cell}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="mt-3.5 text-[12.5px] text-(--dim2)">
          All fine tools, and all of them do things launcharr doesn&rsquo;t.
          This table is about temperament, not superiority.
        </p>
      </section>

      {/* ---- install ---- */}
      <section id="install" className={`${SECTION} pb-24`}>
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-6">
          <h2 className={EYEBROW}>Install</h2>
          <span className="text-[12.5px] text-(--dim2)">
            Apple Silicon · {VERSION}
            {RELEASE.signed ? ' signed & notarized' : null}
          </span>
        </div>
        <InstallTabs />
        <p className="mt-[18px] max-w-[74ch] font-sans text-sm leading-[1.7] text-(--muted) text-pretty">
          First run: the panel appears once with the hint line, a default config
          is written to{' '}
          <code className={MONO_CODE}>~/.config/launcharr/config.json</code>,
          and launcharr registers as a login item (toggleable in settings). The
          bar is off by default — flip{' '}
          <code className={MONO_CODE}>bar.enabled</code> when you&rsquo;re ready
          to retire your menubar.
        </p>
      </section>

      {/* ---- roadmap ---- */}
      <section id="roadmap" className="border-t border-(--hair) bg-(--bg2)">
        <div
          className={`${SECTION} grid items-start gap-16 py-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]`}
        >
          <div className="grid gap-4">
            <h2 className={EYEBROW}>Building in the open — v0.5</h2>
            <p className={`m-0 ${PROSE}`}>
              v0.5 is the release where launcharr becomes a control surface:
              bar, panels, agents. It&rsquo;s in daily use now and lands piece
              by piece. Explicit non-goals hold: no file search, no snippets,{' '}
              <em>not a distro</em> — bar + launcher + config, each
              independently toggleable.
            </p>
          </div>
          <div className="grid gap-3 rounded-xl border border-(--hair) bg-(--bg) px-6 py-[22px] text-[13px]">
            {ROADMAP.map(([state, title, note]) => (
              <div key={title} className="flex gap-3">
                <span className={`min-w-[1.2em] ${MARK[state].className}`}>
                  {MARK[state].glyph}
                </span>
                <span className="text-(--fg)">{title}</span>
                <span className="ml-auto text-right text-(--dim)">{note}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- footer ---- */}
      <footer className="border-t border-(--hair)">
        <div
          className={`${SECTION} flex flex-wrap items-center justify-between gap-6 py-10`}
        >
          <div className="flex items-center gap-3.5">
            <Image
              src="/menubar-icon.png"
              alt=""
              width={34}
              height={34}
              className="opacity-75 [filter:var(--logo)]"
            />
            <span className="text-[13px] text-(--dim2)">
              launcharr {VERSION} — because the apps won&rsquo;t launch
              themselves. Yarr.
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-5 text-[13px]">
            <a
              href={GITHUB_URL}
              className="inline-flex items-center gap-[7px] text-(--dim) hover:text-(--fg) hover:no-underline"
            >
              <GithubIcon size={15} />
              github
            </a>
            <Link
              href="/docs"
              className="inline-flex items-center gap-[7px] text-(--dim) hover:text-(--fg) hover:no-underline"
            >
              <FileCode2 size={15} strokeWidth={1.75} />
              scripts api
            </Link>
            <a
              href={RELEASES_URL}
              className="inline-flex items-center gap-[7px] text-(--dim) hover:text-(--fg) hover:no-underline"
            >
              <Tag size={15} strokeWidth={1.75} />
              releases
            </a>
            <a
              href="https://x.com/mitchmalone"
              className="inline-flex items-center gap-[7px] text-(--dim) hover:text-(--fg) hover:no-underline"
            >
              <XIcon size={15} />
              @mitchmalone
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
