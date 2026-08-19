'use client'

import {
  Bar,
  BarAgents,
  BarBatteryCell,
  BarClock,
  BarFrontApp,
  BarWifiCell,
  BarWorkspaces,
  formatBarClock,
} from '@launcharr/tui'
import { useEffect, useState } from 'react'

import { WIFI, demoSnapshot } from '@/lib/demo-data'

import { useWebBarHover } from './bar-hover'

/**
 * The bar across the top of the demo desktop — the *actual* bar components from
 * `@launcharr/tui`, the same ones the desktop app renders. The website supplies
 * a fictional snapshot and its own hover feed; it owns no bar markup or CSS
 * (AGENTS invariant 10).
 */
export function DemoBar({
  workspace,
  onWorkspace,
}: {
  workspace: string
  onWorkspace: (ws: string) => void
}) {
  // Client-only: a build-time clock would ship stale into static HTML and
  // hydrate-mismatch. The real bar gets `now` from Rust's 1 Hz push.
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const hover = useWebBarHover()
  const snap = demoSnapshot(Math.floor((now?.getTime() ?? 0) / 1000), workspace)

  return (
    <div className="absolute inset-x-0 top-0 z-10">
      <Bar
        left={[
          <BarWorkspaces
            key="workspaces"
            workspaces={snap.workspaces}
            focused={snap.focused}
            onSwitch={onWorkspace}
          />,
          <BarAgents
            key="agents"
            agents={snap.agents}
            now={now ?? new Date(0)}
            hover={hover}
          />,
          snap.frontApp ? (
            <BarFrontApp key="frontApp" name={snap.frontApp} />
          ) : null,
        ]}
        center={
          now ? <BarClock key="clock">{formatBarClock(now)}</BarClock> : null
        }
        right={[
          <BarWifiCell
            key="wifi"
            online={snap.wifi.online}
            ssid={snap.wifi.ssid}
            rssi={snap.wifi.rssi}
            hover={hover}
            // The card is the shipping component; only the addresses are fake.
            detail={{
              iface: WIFI.status.iface,
              online: snap.wifi.online,
              ssid: snap.wifi.ssid,
              ip: WIFI.status.ip,
              router: WIFI.status.router,
              dns: WIFI.status.dns,
            }}
          />,
          <BarBatteryCell
            key="battery"
            pct={snap.batteryPct}
            onAc={snap.onAc}
            charging={snap.charging}
            chargeLimit={snap.chargeLimit}
            // No CoreAudio/ioreg in a browser: the strip is real, the card
            // needs a machine, so the demo shows the cell without one.
            detail={null}
            hover={hover}
          />,
        ]}
      />
    </div>
  )
}
