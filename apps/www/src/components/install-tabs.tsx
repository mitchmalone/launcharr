'use client'

import { useState } from 'react'

import {
  BREW_COMMAND,
  GITHUB_URL,
  RELEASE,
  RELEASES_URL,
  SOURCE_INSTALL_COMMANDS,
} from '@/lib/site'

import { CopyInstall } from './copy-install'

/**
 * Install methods, tabbed in recommendation order: Homebrew → Download → Source.
 * Pre-release (release.json artifacts === null) collapses to Source only.
 */
const MONO_CODE = 'font-mono text-(--fg)'

export function InstallTabs() {
  const tabs = RELEASE.artifacts
    ? (['Homebrew', 'Download', 'Source'] as const)
    : (['Source'] as const)
  const [tab, setTab] = useState<string>(tabs[0])

  return (
    <div className="overflow-hidden rounded-xl border border-(--border)">
      <div className="flex items-center justify-between gap-4 border-b border-(--border) bg-(--chip) px-2 pt-1">
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`cursor-pointer rounded-t-md border-b-2 px-3.5 py-2 font-mono text-xs ${
                tab === t
                  ? 'border-(--accent) text-(--fg)'
                  : 'border-transparent text-(--dim) hover:text-(--fg)'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        {tab === 'Source' ? (
          <span className="pr-2">
            <CopyInstall />
          </span>
        ) : null}
      </div>

      {tab === 'Homebrew' && RELEASE.artifacts ? (
        <>
          <pre className="m-0 overflow-x-auto bg-(--bg) px-5 py-[22px] font-mono text-[13.5px] leading-[1.85] text-(--fg)">
            <span className="text-(--dim2)">$</span> {BREW_COMMAND}
          </pre>
          <div className="border-t border-(--border) bg-(--chip) px-4 py-2.5 text-xs text-(--dim)">
            Updates with <code className={MONO_CODE}>brew upgrade</code>. The
            recommended install.
          </div>
        </>
      ) : null}

      {tab === 'Download' && RELEASE.artifacts ? (
        <>
          <div className="grid gap-3 bg-(--bg) px-5 py-[22px] font-mono text-[13.5px]">
            <a href={RELEASE.artifacts.dmg.url}>
              launcharr-{RELEASE.version}.dmg
            </a>
            <a href={RELEASE.artifacts.zip.url}>
              launcharr-{RELEASE.version}.zip
            </a>
          </div>
          <div className="border-t border-(--border) bg-(--chip) px-4 py-2.5 text-xs text-(--dim)">
            <a href={RELEASES_URL}>All releases + SHA256 checksums</a>
            {RELEASE.signed ? ' · signed & notarized' : null}
          </div>
        </>
      ) : null}

      {tab === 'Source' ? (
        <>
          <pre className="m-0 overflow-x-auto bg-(--bg) px-5 py-[22px] font-mono text-[13.5px] leading-[1.85] text-(--fg)">
            {SOURCE_INSTALL_COMMANDS.map((cmd, i) => (
              <span key={i}>
                <span className="text-(--dim2)">$</span> {cmd}
                {i < SOURCE_INSTALL_COMMANDS.length - 1 ? '\n' : ''}
              </span>
            ))}
          </pre>
          <div className="border-t border-(--border) bg-(--chip) px-4 py-2.5 text-xs text-(--dim)">
            Requires Rust stable + pnpm ·{' '}
            <a href={GITHUB_URL}>github.com/mitchmalone/launcharr</a>
          </div>
        </>
      ) : null}
    </div>
  )
}
