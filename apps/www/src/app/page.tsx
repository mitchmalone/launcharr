import {
  ArrowUpRight,
  ChevronRight,
  ClipboardList,
  FileCode2,
  HardDrive,
  Settings,
  ShieldCheck,
  SquareTerminal,
  Star,
  Tag,
  Terminal,
  WifiOff,
} from 'lucide-react'
import Image from 'next/image'

import { GithubIcon, XIcon } from '@/components/brand-icons'
import { DemoChips, DemoPanel, DemoProvider } from '@/components/demo-panel'
import { DesktopDemo } from '@/components/desktop-demo'
import { InstallTabs } from '@/components/install-tabs'
import { SiteHeader } from '@/components/site-header'
import { GITHUB_URL, RELEASE, VERSION } from '@/lib/site'

const MONO_CODE = 'font-mono text-(--fg)'

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
    title: 'Hackable in TypeScript',
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
]

const STATS = [
  { value: '~90MB', caption: 'resident while idling invisibly' },
  { value: '<100ms', caption: 'summon budget — measured in single-digit ms' },
  { value: '0', caption: 'permissions granted, network requests made' },
  { value: '8', caption: 'results max — ⌘1–⌘8 jumps straight to one' },
]

const PRIVACY = [
  {
    icon: ShieldCheck,
    title: 'No Accessibility. No Full Disk Access.',
    body: "The only prompts you'll ever see are macOS's standard Automation consents — the first terminal hand-off, the first Finder command.",
  },
  {
    icon: WifiOff,
    title: 'Zero network, one exception.',
    body: "Core makes no requests. The exception is user-initiated: fetching a site's favicon at the moment you add it as a quicklink. No telemetry, no phoning home.",
  },
  {
    icon: HardDrive,
    title: 'Clipboard history stays local.',
    body: '200 text items on disk under your own home directory. Concealed types — password-manager clips — are never recorded.',
  },
]

const SECTION_H2 =
  'text-[13px] font-medium uppercase tracking-[0.14em] text-(--dim)'

export default function Home() {
  return (
    <div className="min-h-screen">
      <SiteHeader />

      <section className="mx-auto grid max-w-[1080px] justify-items-start gap-7 px-8 pb-14 pt-[88px]">
        <Image
          src="/menubar-icon.png"
          alt=""
          width={92}
          height={92}
          className="-mb-1.5 [filter:var(--logo)]"
        />
        <div className="inline-flex items-center gap-2.5 rounded-full border border-(--border) px-3.5 py-1.5 text-xs text-(--dim)">
          <span className="h-1.5 w-1.5 rounded-full bg-(--green)" />
          macOS · Apple Silicon · free &amp; open source
        </div>
        <h1 className="max-w-[16ch] text-balance text-[42px] font-bold leading-[1.04] tracking-[-0.035em] sm:text-[60px]">
          An app launcher for pirates.
        </h1>
        <p className="max-w-[62ch] text-pretty font-sans text-[19px] leading-[1.6] text-(--body)">
          Alfred and Raycast dress up as polished macOS utilities. launcharr
          dresses up as a shell prompt: hit{' '}
          <kbd className="rounded-[5px] border border-(--border) border-b-2 px-1.5 py-px font-mono text-[15px] text-(--fg)">
            ⌥Space
          </kbd>
          , type into something that behaves like a REPL, and either launch an
          app or fling a command at your terminal without breaking flow.
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <a
            href={RELEASE.artifacts ? RELEASE.artifacts.dmg.url : '#install'}
            className="inline-flex items-center gap-[9px] rounded-[7px] bg-(--cta) px-5 py-3 text-sm font-medium text-(--cta-fg) hover:bg-(--cta-hover) hover:text-(--cta-fg) hover:no-underline"
          >
            <Terminal size={16} strokeWidth={2} />
            {RELEASE.artifacts ? 'Download for Mac' : 'Build from source'}
          </a>
          <a
            href={GITHUB_URL}
            className="inline-flex items-center gap-[9px] rounded-[7px] border border-(--border) px-5 py-3 text-sm text-(--fg) hover:border-(--accent) hover:text-(--fg) hover:no-underline"
          >
            <Star size={16} strokeWidth={1.75} />
            Star on GitHub
          </a>
          <span className="text-[12.5px] text-(--dim2)">
            {RELEASE.artifacts
              ? `${VERSION} · Apple Silicon${RELEASE.signed ? ' · signed & notarized' : ''}`
              : `no release binaries yet — ${VERSION}, source only`}
          </span>
        </div>
      </section>

      <section id="demo" className="mx-auto max-w-[1080px] px-8 pb-24 pt-10">
        <DemoProvider>
          <DesktopDemo>
            <DemoPanel />
          </DesktopDemo>
          <DemoChips />
        </DemoProvider>
      </section>

      <section id="features" className="mx-auto max-w-[1080px] px-8 pb-24">
        <h2 className={`${SECTION_H2} mb-6`}>What it does</h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-px overflow-hidden rounded-xl border border-(--hair) bg-(--hair)">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="grid content-start gap-2.5 bg-(--bg) px-6 py-[26px]"
            >
              {f.icon}
              <h3 className="text-[15px] font-semibold">{f.title}</h3>
              <p className="font-sans text-sm leading-[1.6] text-(--muted)">
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-(--hair) bg-(--bg2)">
        <div className="mx-auto grid max-w-[1080px] grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-10 px-8 py-14">
          {STATS.map((s) => (
            <div key={s.caption} className="grid gap-2">
              <span className="text-[38px] font-bold tracking-[-0.03em] text-(--fg)">
                {s.value}
              </span>
              <span className="text-[13px] text-(--muted)">{s.caption}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-[1080px] items-start gap-16 px-8 py-24 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="grid gap-4">
          <h2 className={SECTION_H2}>Permissions &amp; privacy</h2>
          <p className="text-pretty font-sans text-[17px] leading-[1.6] text-(--body)">
            Most launchers ask for the keys to the whole machine. launcharr asks
            for none of them, and the design is built so it never has to.
          </p>
        </div>
        <div className="grid gap-px overflow-hidden rounded-xl border border-(--hair) bg-(--hair)">
          {PRIVACY.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="grid grid-cols-[20px_minmax(0,1fr)] gap-x-3.5 gap-y-1.5 bg-(--bg) px-6 py-[22px]"
            >
              <Icon
                size={20}
                strokeWidth={1.75}
                className="row-span-2 text-(--green)"
              />
              <h3 className="text-sm font-semibold">{title}</h3>
              <p className="font-sans text-sm leading-[1.6] text-(--muted)">
                {body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section id="install" className="mx-auto max-w-[1080px] px-8 pb-24">
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-6">
          <h2 className={SECTION_H2}>Install</h2>
          <span className="text-[12.5px] text-(--dim2)">
            Apple Silicon · requires Rust stable + pnpm
          </span>
        </div>
        <InstallTabs />
        <p className="mt-[18px] max-w-[74ch] text-pretty font-sans text-sm leading-[1.7] text-(--muted)">
          First run: the panel appears once with the hint line, a default config
          is written to{' '}
          <code className={MONO_CODE}>~/.config/launcharr/config.json</code>,
          and launcharr registers as a login item (toggleable in settings).
          Signed releases are tracked in{' '}
          <a href={`${GITHUB_URL}/blob/main/docs/RELEASING.md`}>
            docs/RELEASING.md
          </a>
          .
        </p>
      </section>

      <footer className="border-t border-(--hair)">
        <div className="mx-auto flex max-w-[1080px] flex-wrap items-center justify-between gap-6 px-8 py-10">
          <div className="flex items-center gap-3.5">
            <Image
              src="/menubar-icon.png"
              alt=""
              width={34}
              height={34}
              className="opacity-75 [filter:var(--logo)]"
            />
            <span className="text-[13px] text-(--dim2)">
              launcharr {VERSION} — because the apps won&apos;t launch
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
            <a
              href={`${GITHUB_URL}/blob/main/docs/SCRIPTS.md`}
              className="inline-flex items-center gap-[7px] text-(--dim) hover:text-(--fg) hover:no-underline"
            >
              <FileCode2 size={15} strokeWidth={1.75} />
              scripts api
            </a>
            <a
              href={`${GITHUB_URL}/releases`}
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
