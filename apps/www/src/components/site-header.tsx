import Image from 'next/image'

import { GITHUB_URL, VERSION } from '@/lib/site'

import { GithubIcon } from './brand-icons'
import { ThemeSwitch } from './theme-switch'

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-6 border-b border-(--hair) bg-(--panel) px-8 py-3 backdrop-blur-md">
      <div className="flex items-center gap-3">
        <Image
          src="/menubar-icon.png"
          alt="launcharr"
          width={44}
          height={44}
          className="[filter:var(--logo)]"
        />
        <span className="text-base font-bold tracking-[-0.01em]">
          launcharr
        </span>
        <span className="rounded-full border border-(--border) px-2 py-0.5 text-[11px] text-(--dim)">
          {VERSION}
        </span>
      </div>
      <nav className="flex items-center gap-5 text-[13px] text-(--dim)">
        <a
          href="#demo"
          className="hidden text-(--dim) hover:text-(--fg) hover:no-underline sm:block"
        >
          demo
        </a>
        <a
          href="#features"
          className="hidden text-(--dim) hover:text-(--fg) hover:no-underline sm:block"
        >
          features
        </a>
        <a
          href="#install"
          className="hidden text-(--dim) hover:text-(--fg) hover:no-underline sm:block"
        >
          install
        </a>
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
