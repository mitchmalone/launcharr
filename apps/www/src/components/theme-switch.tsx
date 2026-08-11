'use client'

import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useSyncExternalStore } from 'react'

const emptySubscribe = () => () => {}
const useMounted = () =>
  useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  )

const THEMES = [
  { id: 'light', icon: Sun, title: 'Light' },
  { id: 'system', icon: Monitor, title: 'System' },
  { id: 'dark', icon: Moon, title: 'Dark' },
] as const

export function ThemeSwitch() {
  const { theme, setTheme } = useTheme()
  const mounted = useMounted()

  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-(--border) p-0.5">
      {THEMES.map(({ id, icon: Icon, title }) => {
        const isActive = mounted && theme === id
        return (
          <button
            key={id}
            type="button"
            title={title}
            aria-label={title}
            onClick={() => setTheme(id)}
            className={`inline-flex h-[26px] w-[30px] cursor-pointer items-center justify-center rounded-md border-none ${
              isActive
                ? 'bg-(--chip) text-(--fg)'
                : 'bg-transparent text-(--dim)'
            }`}
          >
            <Icon size={15} strokeWidth={1.75} />
          </button>
        )
      })}
    </div>
  )
}
