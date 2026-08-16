import Image from 'next/image'
import Link from 'next/link'

import { GITHUB_URL } from '@/lib/site'

import { GithubIcon } from './brand-icons'
import { ThemeSwitch } from './theme-switch'

const SECTIONS = [
  ['scripts', 'scripts'],
  ['config', 'config'],
  ['panels', 'panels'],
  ['uninstall', 'uninstall'],
] as const

export function DocsHeader() {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-6 border-b border-(--hair) bg-(--panel) px-8 py-3 backdrop-blur-md">
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="flex items-center gap-3 hover:no-underline"
          aria-label="launcharr home"
        >
          <Image
            src="/menubar-icon.png"
            alt=""
            width={40}
            height={40}
            className="[filter:var(--logo)]"
          />
          <span className="text-base font-bold tracking-[-0.01em] text-(--fg)">
            launcharr
          </span>
        </Link>
        <span className="text-[13px] text-(--dim)">/ docs</span>
      </div>
      <nav className="flex items-center gap-5 text-[13px]">
        {SECTIONS.map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            className="hidden text-(--dim) hover:text-(--fg) hover:no-underline sm:block"
          >
            {label}
          </a>
        ))}
        <ThemeSwitch />
        <a
          href={GITHUB_URL}
          className="inline-flex items-center gap-2 rounded-md border border-(--border) px-3 py-1.5 text-(--fg) hover:border-(--accent) hover:text-(--fg) hover:no-underline"
        >
          <GithubIcon size={15} />
          Star
        </a>
      </nav>
    </header>
  )
}
