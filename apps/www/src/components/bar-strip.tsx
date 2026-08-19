'use client'

import {
  Bar,
  BarAgents,
  BarBatteryCell,
  BarClock,
  BarFrontApp,
  BarWifiCell,
  BarWorkspaces,
} from '@launcharr/tui'
import { useMemo, useState } from 'react'

import { useWebBarHover } from '@/components/demo/bar-hover'
import { demoSnapshot } from '@/lib/demo-data'

import { BarThemeScope } from './bar-theme-scope'

/**
 * A still of the bar for the explainer section — the real components from
 * `@launcharr/tui`, frozen at a fixed clock so it reads like a screenshot.
 * The website owns no bar markup (AGENTS invariant 10).
 */
export function BarStrip() {
  // Fixed instant, chosen once: this is a still, not a live strip.
  const [now] = useState(() => new Date(2026, 7, 16, 9, 41))
  const snap = useMemo(
    () => demoSnapshot(Math.floor(now.getTime() / 1000), '2'),
    [now],
  )
  const hover = useWebBarHover()

  return (
    <BarThemeScope className="overflow-hidden rounded-[10px] border border-(--hair)">
      <Bar
        left={[
          <BarWorkspaces
            key="workspaces"
            workspaces={snap.workspaces}
            focused={snap.focused}
            onSwitch={() => {}}
          />,
          <BarAgents
            key="agents"
            agents={snap.agents}
            now={now}
            hover={hover}
          />,
          snap.frontApp ? (
            <BarFrontApp key="frontApp" name={snap.frontApp} />
          ) : null,
        ]}
        center={<BarClock key="clock">Sat 16 Aug 09:41</BarClock>}
        right={[
          <BarWifiCell
            key="wifi"
            online={snap.wifi.online}
            ssid={snap.wifi.ssid}
            rssi={snap.wifi.rssi}
          />,
          <BarBatteryCell
            key="battery"
            pct={snap.batteryPct}
            onAc={snap.onAc}
            charging={snap.charging}
            chargeLimit={snap.chargeLimit}
            detail={null}
            hover={hover}
          />,
        ]}
      />
    </BarThemeScope>
  )
}
