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

const noop = () => {}
const base = {
  networks: NETWORKS,
  busy: null,
  error: null,
  onConnect: noop,
  onTogglePower: noop,
  onClose: noop,
}

export const wifiPanelStories = defineStories('WifiPanel (app)', [
  {
    name: 'connected',
    keys: '↑↓ move · ↵ connect · p power · esc back',
    render: () => <WifiPanel {...base} status={CONNECTED} />,
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
    render: () => (
      <WifiPanel
        {...base}
        status={CONNECTED}
        networks={[
          ...NETWORKS,
          'A network with an unreasonably long name that should ellipsize instead of wrapping the row',
          ...Array.from({ length: 8 }, (_, i) => `Guest-${i + 1}`),
        ]}
      />
    ),
  },
])
