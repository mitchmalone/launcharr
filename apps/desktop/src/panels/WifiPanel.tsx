/**
 * Wifi panel, presentational half: pure props + @launcharr/tui, no tauri
 * imports — the workbench renders every state of this file directly. The
 * container (WifiPanelContainer) owns invokes, refresh, and the scan.
 */
import {
  KeyHints,
  ListRow,
  Panel,
  SectionHeader,
  TextPrompt,
  useListNav,
} from '@launcharr/tui'
import { useState } from 'react'

export interface WifiStatus {
  iface: string | null
  power: boolean
  online: boolean
  ssid: string | null
  ip: string | null
  router: string | null
  dns: string | null
}

/** Mirrors ScanNetwork in wifi.rs. */
export interface ScanNetwork {
  ssid: string
  secured: boolean
  signal: number | null
}

export interface WifiPanelProps {
  status: WifiStatus | null
  networks: string[]
  /** null until the first scan of this panel visit. */
  scanned: ScanNetwork[] | null
  scanning: boolean
  /** SSID with a connect in flight. */
  busy: string | null
  error: string | null
  onConnect: (ssid: string, password?: string) => void
  onScan: () => void
  onTogglePower: () => void
  onClose: () => void
}

export function WifiPanel(props: WifiPanelProps) {
  const [askPassword, setAskPassword] = useState<string | null>(null)
  if (askPassword) {
    return (
      <PasswordStep
        ssid={askPassword}
        busy={props.busy}
        error={props.error}
        onSubmit={(pw) => {
          // Fire and pop back to the list — the row shows "connecting…", and
          // a bad password surfaces on the error row.
          props.onConnect(askPassword, pw)
          setAskPassword(null)
        }}
        onCancel={() => setAskPassword(null)}
      />
    )
  }
  return <NetworkList {...props} onAskPassword={setAskPassword} />
}

function NetworkList({
  status,
  networks,
  scanned,
  scanning,
  busy,
  error,
  onConnect,
  onScan,
  onTogglePower,
  onClose,
  onAskPassword,
}: WifiPanelProps & { onAskPassword: (ssid: string) => void }) {
  // Keyboard order: pinned current network, known networks, the scan action,
  // then scan results — index arithmetic below mirrors exactly this layout.
  const current =
    status?.ssid && networks.includes(status.ssid) ? status.ssid : null
  const known = networks.filter((n) => n !== current)
  const others = (scanned ?? []).filter(
    (n) => n.ssid !== status?.ssid && !networks.includes(n.ssid),
  )
  const knownBase = current ? 1 : 0
  const scanIndex = knownBase + known.length
  const othersBase = scanIndex + 1
  const count = othersBase + others.length

  const activate = (index: number) => {
    if (busy) return
    if (index === scanIndex) {
      if (!scanning) onScan()
      return
    }
    if (current && index === 0) {
      onConnect(current)
      return
    }
    const knownSsid = known[index - knownBase]
    if (index < scanIndex && knownSsid) {
      onConnect(knownSsid)
      return
    }
    const other = others[index - othersBase]
    if (!other) return
    // Joining an unknown secured network needs a passphrase first.
    if (other.secured) onAskPassword(other.ssid)
    else onConnect(other.ssid)
  }
  const nav = useListNav(count, { onActivate: activate, onBack: onClose })

  const subtitle = !status
    ? 'loading…'
    : !status.power
      ? 'Wi-Fi off'
      : status.online
        ? 'Connected'
        : 'Offline'

  const networkRow = (
    ssid: string,
    index: number,
    right: string | undefined,
  ) => (
    <ListRow
      key={`row-${index}-${ssid}`}
      icon="◠"
      label={ssid}
      selected={index === nav.index}
      right={busy === ssid ? 'connecting…' : right}
      onClick={() => activate(index)}
      onHover={() => nav.setIndex(index)}
    />
  )

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
        if (e.key === 's') {
          e.preventDefault()
          if (!scanning) onScan()
          return
        }
        nav.onKeyDown(e)
      }}
      footer={
        <KeyHints
          hints={[
            { keys: '↑↓', label: 'move' },
            { keys: '↵', label: 'connect' },
            { keys: 's', label: 'scan' },
            { keys: 'p', label: status?.power ? 'power off' : 'power on' },
            { keys: 'esc', label: 'back' },
          ]}
        />
      }
    >
      {error && <ListRow icon="✕" label={error} right="" dim />}
      {current && networkRow(current, 0, 'connected')}
      <SectionHeader label="Known networks" />
      {status !== null && !status.power ? (
        <ListRow dim label="Wi-Fi is off" sub="press p to power on" />
      ) : known.length === 0 ? (
        <ListRow dim label={status ? 'no known networks' : 'loading…'} />
      ) : (
        <div className="tui-scroll">
          {known.map((ssid, i) => networkRow(ssid, knownBase + i, undefined))}
        </div>
      )}
      <ListRow
        icon="⌕"
        label={scanning ? 'Scanning…' : 'Scan for networks…'}
        sub={scanned === null && !scanning ? 'press s' : undefined}
        selected={scanIndex === nav.index}
        onClick={() => !scanning && onScan()}
        onHover={() => nav.setIndex(scanIndex)}
      />
      {scanned !== null && (
        <>
          <SectionHeader label="Other networks" />
          {others.length === 0 ? (
            <ListRow dim label="nothing new nearby" />
          ) : (
            <div className="tui-scroll">
              {others.map((n, i) =>
                networkRow(n.ssid, othersBase + i, n.secured ? 'wpa' : 'open'),
              )}
            </div>
          )}
        </>
      )}
    </Panel>
  )
}

function PasswordStep({
  ssid,
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  ssid: string
  busy: string | null
  error: string | null
  onSubmit: (password: string) => void
  onCancel: () => void
}) {
  const [password, setPassword] = useState('')
  return (
    <Panel
      icon="◠"
      title={ssid}
      subtitle="enter password to join"
      footer={
        <KeyHints
          hints={[
            { keys: '↵', label: 'join' },
            { keys: 'esc', label: 'back' },
          ]}
        />
      }
    >
      {error && <ListRow icon="✕" label={error} right="" dim />}
      <TextPrompt
        autoFocus
        secret
        sigil="⚿"
        value={password}
        onChange={setPassword}
        placeholder={busy ? 'joining…' : 'Password'}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && password && !busy) {
            e.preventDefault()
            onSubmit(password)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            onCancel()
          }
        }}
      />
    </Panel>
  )
}
