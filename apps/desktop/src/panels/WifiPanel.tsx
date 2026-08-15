/**
 * Wifi panel, presentational half: pure props + @launcharr/tui, no tauri
 * imports — the workbench renders every state of this file directly. The
 * container (WifiPanelContainer) owns invokes and refresh.
 */
import {
  KeyHints,
  ListRow,
  Panel,
  SectionHeader,
  useListNav,
} from '@launcharr/tui'

export interface WifiStatus {
  iface: string | null
  power: boolean
  online: boolean
  ssid: string | null
  ip: string | null
  router: string | null
  dns: string | null
}

export interface WifiPanelProps {
  status: WifiStatus | null
  networks: string[]
  /** SSID with a connect in flight. */
  busy: string | null
  error: string | null
  onConnect: (ssid: string) => void
  onTogglePower: () => void
  onClose: () => void
}

export function WifiPanel({
  status,
  networks,
  busy,
  error,
  onConnect,
  onTogglePower,
  onClose,
}: WifiPanelProps) {
  const nav = useListNav(networks.length, {
    onActivate: (i) => {
      const ssid = networks[i]
      if (ssid && !busy) onConnect(ssid)
    },
    onBack: onClose,
  })

  const subtitle = !status
    ? 'loading…'
    : !status.power
      ? 'Wi-Fi off'
      : status.online
        ? 'Connected'
        : 'Offline'

  return (
    <Panel
      autoFocus
      icon="◠"
      title={status?.ssid ?? 'Wi-Fi'}
      subtitle={subtitle}
      onKeyDown={(e) => {
        if (e.key === 'p') {
          e.preventDefault()
          onTogglePower()
          return
        }
        nav.onKeyDown(e)
      }}
      footer={
        <KeyHints
          hints={[
            { keys: '↑↓', label: 'move' },
            { keys: '↵', label: 'connect' },
            { keys: 'p', label: status?.power ? 'power off' : 'power on' },
            { keys: 'esc', label: 'back' },
          ]}
        />
      }
    >
      {status?.power && (
        <>
          <SectionHeader label="Connection" />
          <ListRow dim label="IP address" right={status.ip ?? '—'} />
          <ListRow dim label="Router" right={status.router ?? '—'} />
          <ListRow dim label="DNS" right={status.dns ?? '—'} />
        </>
      )}
      {error && <ListRow icon="✕" label={error} right="" dim />}
      <SectionHeader label="Known networks" />
      {status !== null && !status.power ? (
        <ListRow dim label="Wi-Fi is off" sub="press p to power on" />
      ) : networks.length === 0 ? (
        <ListRow dim label={status ? 'no known networks' : 'loading…'} />
      ) : (
        networks.map((ssid, i) => (
          <ListRow
            key={ssid}
            icon="◠"
            label={ssid}
            selected={i === nav.index}
            right={
              busy === ssid
                ? 'connecting…'
                : status?.ssid === ssid
                  ? 'connected'
                  : undefined
            }
            onClick={() => !busy && onConnect(ssid)}
            onHover={() => nav.setIndex(i)}
          />
        ))
      )}
      <ListRow
        dim
        label="Scan for networks…"
        sub="needs Location Services — not yet enabled"
      />
    </Panel>
  )
}
