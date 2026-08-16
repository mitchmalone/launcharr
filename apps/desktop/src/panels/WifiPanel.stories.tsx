import { defineStories } from '@launcharr/tui'

import { WifiPanel, type WifiStatus } from './WifiPanel'

const CONNECTED: WifiStatus = {
  iface: 'en0',
  power: true,
  online: true,
  ssid: 'RamenAmok',
  ip: '192.168.0.199',
  router: '192.168.0.1',
  dns: '1.1.1.1',
}

const NETWORKS = ['RamenAmok', 'RamenAmok-2.4', 'Cinque', 'Ace Hotel Sydney']

const SCANNED = [
  { ssid: 'RUT241_4B56', secured: true, signal: -52 },
  { ssid: 'Gateway_F7880B', secured: true, signal: -61 },
  { ssid: 'Open Cafe', secured: false, signal: -70 },
]

const noop = () => {}
const base = {
  networks: NETWORKS,
  scanned: null,
  scanning: false,
  busy: null,
  error: null,
  onConnect: noop,
  onScan: noop,
  onTogglePower: noop,
  onClose: noop,
}

export const wifiPanelStories = defineStories('WifiPanel (app)', [
  {
    name: 'connected',
    keys: '↑↓ move · ↵ connect · s scan · p power · esc back',
    render: () => <WifiPanel {...base} status={CONNECTED} />,
  },
  {
    name: 'scanning',
    render: () => <WifiPanel {...base} status={CONNECTED} scanning />,
  },
  {
    name: 'scan results (wpa/open, secured asks password)',
    notes:
      'Enter on a secured unknown network swaps to the password step; open networks join straight away.',
    render: () => <WifiPanel {...base} status={CONNECTED} scanned={SCANNED} />,
  },
  {
    name: 'scan found nothing new',
    render: () => <WifiPanel {...base} status={CONNECTED} scanned={[]} />,
  },
  {
    name: 'loading',
    render: () => <WifiPanel {...base} status={null} networks={[]} />,
  },
  {
    name: 'connecting (busy row)',
    render: () => <WifiPanel {...base} status={CONNECTED} busy="Cinque" />,
  },
  {
    name: 'connect failed',
    render: () => (
      <WifiPanel
        {...base}
        status={{ ...CONNECTED, online: true }}
        error="Failed to join network Cinque."
      />
    ),
  },
  {
    name: 'offline',
    render: () => (
      <WifiPanel
        {...base}
        status={{ ...CONNECTED, online: false, ssid: null, ip: null }}
      />
    ),
  },
  {
    name: 'power off',
    render: () => (
      <WifiPanel
        {...base}
        status={{ ...CONNECTED, power: false, online: false, ssid: null }}
      />
    ),
  },
  {
    name: 'long list overflow',
    notes:
      'Active network stays pinned above the fold; only the rest scroll, and keyboard selection scrolls into view.',
    render: () => (
      <div style={{ height: 420, display: 'flex' }}>
        <WifiPanel
          {...base}
          status={CONNECTED}
          networks={[
            ...NETWORKS,
            'A network with an unreasonably long name that should ellipsize instead of wrapping the row',
            ...Array.from({ length: 8 }, (_, i) => `Guest-${i + 1}`),
          ]}
        />
      </div>
    ),
  },
])
