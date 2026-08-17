import type { Metadata } from 'next'
import Link from 'next/link'

import { DocsHeader } from '@/components/docs-header'
import { PANEL_INFO } from '@/lib/demo-data'
import { VERSION } from '@/lib/site'

export const metadata: Metadata = {
  title: 'launcharr docs — scripts, config, panels',
  description:
    'The launcharr scripts protocol, config.json reference, panel triggers, and how to uninstall. Drop an executable in a folder and its trigger word joins the launcher grammar.',
}

const SECTION = 'mx-auto max-w-[900px] px-8'
const H2 =
  'm-0 mb-5 text-[13px] font-medium uppercase tracking-[0.14em] text-(--dim)'
const PROSE = 'font-sans text-[15px] leading-[1.7] text-(--body) text-pretty'
const CODE = 'font-mono text-(--fg)'

function Pre({ children }: { children: React.ReactNode }) {
  return (
    <pre className="m-0 overflow-x-auto rounded-lg border border-(--border) bg-(--chip) px-5 py-4 font-mono text-[13px] leading-[1.7] text-(--fg)">
      {children}
    </pre>
  )
}

function Note({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-1.5 bg-(--bg) px-[22px] py-5">
      <span className="text-[13px] font-semibold">{title}</span>
      <span className="font-sans text-[13px] leading-[1.55] text-(--muted)">
        {children}
      </span>
    </div>
  )
}

const MANIFEST_JSON = `{
  "trigger": "lorem",
  "name": "Lorem ipsum",
  "description": "Generate placeholder text"
}`

const QUERY_JSON = `{
  "items": [
    {
      "title": "Copy 3 paragraphs of lorem ipsum",
      "subtitle": "1,338 chars",
      "action": { "type": "copy", "value": "Lorem ipsum dolor…" }
    }
  ]
}`

/* The bar block mirrors DEFAULT_BAR_LAYOUT in apps/desktop/src/lib/config.ts. */
const CONFIG_JSON = `{
  "theme": "launcharr",
  "themes": { "my-theme": { "accent": "#ff176c" } },
  "bar": {
    "enabled": true,
    "layout": {
      "left":   [{ "id": "workspaces" }, { "id": "agents" }, { "id": "frontApp" }],
      "center": [{ "id": "clock" }],
      "right":  [{ "id": "wifi" }, { "id": "battery" }]
    }
  },
  "agents": { "askMode": false, "askProvider": "claude" },
  "desktop": {
    "tiling":  { "enabled": true, "managed": true, "modifier": "alt", "gaps": 8,
                 "workspaces": 6, "float": ["com.raycast.macos"] },
    "borders": { "enabled": false, "width": 5, "style": "round" },
    "cornerRadius": null
  }
}`

const UNINSTALL = `$ rm -rf /Applications/launcharr.app \\
     ~/.config/launcharr \\
     ~/Library/Application\\ Support/com.mitchmalone.launcharr \\
     ~/Library/LaunchAgents/launcharr.plist`

export default function Docs() {
  return (
    <div className="min-h-screen bg-(--bg) text-(--fg)">
      <DocsHeader />

      {/* ---- scripts ---- */}
      <section id="scripts" className={`${SECTION} pb-20 pt-16`}>
        <h1 className="m-0 mb-4 text-[32px] font-bold tracking-[-0.03em]">
          Scripts are the plugin API.
        </h1>
        <p className={`m-0 mb-8 max-w-[70ch] ${PROSE}`}>
          Drop an executable into{' '}
          <code className={CODE}>~/.config/launcharr/scripts/</code> and its
          trigger word joins the launcher grammar — no restart, no store, no
          manifest file. Any language. The bundled scripts (
          <code className={CODE}>lorem</code>,{' '}
          <code className={CODE}>json</code>, <code className={CODE}>ip</code>)
          are reference implementations and yours to edit.
        </p>

        <h2 className={H2}>The contract — two invocations</h2>
        <div className="grid gap-5">
          <div className="grid gap-2.5">
            <p className="m-0 font-mono text-sm text-(--body)">
              <code className={CODE}>&lt;script&gt; manifest</code> — print a
              JSON manifest to stdout, exit 0
            </p>
            <Pre>{MANIFEST_JSON}</Pre>
          </div>
          <div className="grid gap-2.5">
            <p className="m-0 font-mono text-sm text-(--body)">
              <code className={CODE}>&lt;script&gt; query &lt;args&gt;</code> —
              called on every keystroke (debounced)
            </p>
            <Pre>{QUERY_JSON}</Pre>
          </div>
        </div>

        <div className="mt-7 grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-px overflow-hidden rounded-xl border border-(--hair) bg-(--hair)">
          <Note title="actions">
            <code className={CODE}>copy</code> puts text on the clipboard,{' '}
            <code className={CODE}>open</code> opens a URL, file or app,{' '}
            <code className={CODE}>none</code> is informational.{' '}
            <code className={CODE}>altAction</code> runs on ⌥⏎.
          </Note>
          <Note title="timeouts">
            Manifest 1.5s, query 3s. A slow script gets killed, not waited for.
            stderr is ignored; non-zero exit = no results.
          </Note>
          <Note title="rules">
            Up to 8 items shown. Triggers are whole-word, first registration
            wins. <code className={CODE}>clip</code> is built-in and can&rsquo;t
            be claimed.
          </Note>
          <Note title="python gotcha">
            The scripts dir is <code className={CODE}>sys.path[0]</code> — a
            script named <code className={CODE}>json.py</code> shadows the
            stdlib. Bundled scripts{' '}
            <code className={CODE}>del sys.path[0]</code> first; do the same.
          </Note>
        </div>

        <p className={`m-0 mt-6 max-w-[70ch] ${PROSE}`}>
          Zero-network is culture, not enforcement, for scripts: the launcher
          core never touches the network; what your own scripts do is your
          business.
        </p>
      </section>

      {/* ---- config ---- */}
      <section id="config" className="border-t border-(--hair) bg-(--bg2)">
        <div className={`${SECTION} py-20`}>
          <h2 className={H2}>Config</h2>
          <p className={`m-0 mb-6 max-w-[70ch] ${PROSE}`}>
            Everything lives in{' '}
            <code className={CODE}>~/.config/launcharr/config.json</code> —
            watched and hot-applied, in sync with the settings window both ways.
            Themes are token overlays; unknown names fall back safely so a
            hand-edit can&rsquo;t blank the UI.
          </p>
          <Pre>{CONFIG_JSON}</Pre>
          <p className={`m-0 mt-5 max-w-[70ch] ${PROSE}`}>
            Bar modules live in explicit <code className={CODE}>left</code> /{' '}
            <code className={CODE}>center</code> /{' '}
            <code className={CODE}>right</code> zones and render in the order
            you list them. The clock is an ordinary module — put it wherever you
            like. Displays with a notch have no usable center, so they take an
            optional <code className={CODE}>bar.notchedLayout</code> of the same
            shape; without one, the main layout applies with the center folded
            into the head of the right zone.
          </p>
          <p className={`m-0 mt-5 max-w-[70ch] ${PROSE}`}>
            <code className={CODE}>desktop</code> is the tiling layer: launcharr
            renders{' '}
            <code className={CODE}>~/.config/aerospace/aerospace.toml</code>{' '}
            from these few knobs and reloads AeroSpace live. Set{' '}
            <code className={CODE}>tiling.managed</code> to{' '}
            <code className={CODE}>false</code> and the file is yours —
            launcharr never writes it again. Borders (JankyBorders) are opt-in
            from Settings → Desktop and take their colours from the theme;{' '}
            <code className={CODE}>cornerRadius</code> sets macOS&rsquo;s hidden
            window-corner default (1–26, apps relaunch to pick it up).
          </p>
        </div>
      </section>

      {/* ---- panels ---- */}
      <section id="panels" className={`${SECTION} py-20`}>
        <h2 className={H2}>Panel triggers</h2>
        <p className={`m-0 mb-6 max-w-[70ch] ${PROSE}`}>
          Some trigger words open a full keyboard-driven TUI panel inside the
          launcher window instead of returning rows. They fuzzy-match like apps,
          so you don&rsquo;t have to type them exactly. Esc walks back; focus
          returns exactly where it was — including over a full-screen app.
        </p>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-px overflow-hidden rounded-xl border border-(--hair) bg-(--hair)">
          {PANEL_INFO.map((p) => (
            <Note key={p.id} title={`${p.id} ⏎`}>
              {p.hint.replace(' ▸', '')}
            </Note>
          ))}
        </div>
        <p className={`m-0 mt-5 max-w-[70ch] ${PROSE}`}>
          <code className={CODE}>usage ⏎</code> and{' '}
          <code className={CODE}>agents ⏎</code> are gated on the agent settings
          — both are off until you turn them on.
        </p>
      </section>

      {/* ---- uninstall ---- */}
      <section id="uninstall" className="border-t border-(--hair) bg-(--bg2)">
        <div className={`${SECTION} py-20`}>
          <h2 className={H2}>Uninstall</h2>
          <p className={`m-0 mb-6 max-w-[70ch] ${PROSE}`}>
            No installer, no daemons left behind. Four paths and it&rsquo;s
            gone:
          </p>
          <Pre>{UNINSTALL}</Pre>
          <p className={`m-0 mt-5 max-w-[70ch] ${PROSE}`}>
            Installed with Homebrew?{' '}
            <code className={CODE}>brew uninstall</code> handles the app; the
            three dotfile paths are still yours to remove. AeroSpace (installed
            alongside as a cask dependency) and JankyBorders (if you opted in)
            stay until you <code className={CODE}>brew uninstall</code> them too
            — <code className={CODE}>~/.config/aerospace</code> is only
            launcharr&rsquo;s if its first line says so.
          </p>
        </div>
      </section>

      <footer className="border-t border-(--hair)">
        <div
          className={`${SECTION} flex flex-wrap items-center justify-between gap-6 py-10 text-[13px] text-(--dim2)`}
        >
          <span>
            launcharr {VERSION} — because the apps won&rsquo;t launch
            themselves. Yarr.
          </span>
          <Link href="/" className="text-(--dim) hover:text-(--fg)">
            ← back to the site
          </Link>
        </div>
      </footer>
    </div>
  )
}
