'use client'

import { Copy } from 'lucide-react'
import { useState } from 'react'

import { SOURCE_INSTALL_COMMANDS } from '@/lib/site'

export function CopyInstall() {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard
      ?.writeText(SOURCE_INSTALL_COMMANDS.join('\n'))
      .catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex cursor-pointer items-center gap-[7px] rounded-md border border-(--border) bg-transparent px-2.5 py-1 font-mono text-xs text-(--body) hover:border-(--accent) hover:text-(--fg)"
    >
      <Copy size={13} strokeWidth={1.75} />
      {copied ? 'copied' : 'copy'}
    </button>
  )
}
