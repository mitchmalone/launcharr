import { invoke } from '@tauri-apps/api/core'
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

import './bar.css'

interface BarSnapshot {
  workspaces: string[]
  focused: string | null
  batteryPct: number | null
  onAc: boolean
}

const SNAPSHOT_MS = 2000

function useClock(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

function useSnapshot(): BarSnapshot | null {
  const [snap, setSnap] = useState<BarSnapshot | null>(null)
  useEffect(() => {
    let live = true
    const tick = () =>
      invoke<BarSnapshot>('bar_snapshot')
        .then((s) => live && setSnap(s))
        .catch(() => {})
    tick()
    const id = setInterval(tick, SNAPSHOT_MS)
    return () => {
      live = false
      clearInterval(id)
    }
  }, [])
  return snap
}

function Bar() {
  const now = useClock()
  const snap = useSnapshot()
  const clock = `${now.toLocaleDateString('en', { weekday: 'long' })} ${now
    .getHours()
    .toString()
    .padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
  return (
    <div className="tui bar">
      <div className="bar-left">
        {snap?.workspaces.map((ws) => (
          <span
            key={ws}
            className={`bar-ws ${ws === snap.focused ? 'bar-ws-focused' : ''}`}
          >
            {ws}
          </span>
        ))}
      </div>
      <div className="bar-center">{clock}</div>
      <div className="bar-right">
        {snap?.batteryPct != null && (
          <span className="bar-cell">
            {snap.onAc ? '↯' : '▮'} {snap.batteryPct}%
          </span>
        )}
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Bar />)
