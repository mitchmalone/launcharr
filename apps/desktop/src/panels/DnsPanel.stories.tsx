import { defineStories } from '@launcharr/tui'

import { DnsPanel } from './DnsPanel'
import type { WifiStatus } from './WifiPanel'

const FULL: WifiStatus = {
  iface: 'en0',
  power: true,
  online: true,
  ssid: 'RamenAmok',
  ip: '192.168.1.199',
  router: '192.168.1.1',
  dns: '1.1.1.1',
}

const noop = () => {}

export const dnsPanelStories = defineStories('DnsPanel (app)', [
  {
    name: 'full info',
    keys: 'esc back',
    render: () => <DnsPanel status={FULL} onClose={noop} />,
  },
  {
    name: 'tailscale magicdns note',
    render: () => (
      <DnsPanel status={{ ...FULL, dns: '100.100.100.100' }} onClose={noop} />
    ),
  },
  {
    name: 'loading',
    render: () => <DnsPanel status={null} onClose={noop} />,
  },
  {
    name: 'partial (no router, wired-only ssid)',
    render: () => (
      <DnsPanel status={{ ...FULL, ssid: null, router: null }} onClose={noop} />
    ),
  },
])
