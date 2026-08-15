/**
 * DNS / network-info panel, presentational half (`dns ⏎`). Pure props +
 * @launcharr/tui — storied in the workbench; the container owns invokes.
 * Shares the WifiStatus shape (same backing command).
 */
import { KeyHints, ListRow, Panel, SectionHeader } from '@launcharr/tui'

import type { WifiStatus } from './WifiPanel'

export function DnsPanel({
  status,
  onClose,
}: {
  status: WifiStatus | null
  onClose: () => void
}) {
  return (
    <Panel
      autoFocus
      icon="⇄"
      title="Network"
      subtitle={
        !status ? 'loading…' : (status.ssid ?? status.iface ?? 'no interface')
      }
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          onClose()
        }
      }}
      footer={<KeyHints hints={[{ keys: 'esc', label: 'back' }]} />}
    >
      <SectionHeader label="Connection" />
      <ListRow dim label="Interface" right={status?.iface ?? '—'} />
      <ListRow dim label="IP address" right={status?.ip ?? '—'} />
      <ListRow dim label="Router" right={status?.router ?? '—'} />
      <SectionHeader label="DNS" />
      <ListRow dim label="Resolver" right={status?.dns ?? '—'} />
      {status?.dns === '100.100.100.100' && (
        <ListRow dim label="" sub="100.100.100.100 is Tailscale MagicDNS" />
      )}
    </Panel>
  )
}
