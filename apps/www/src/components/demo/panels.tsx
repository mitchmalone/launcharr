'use client'

import {
  KeyHints,
  ListRow,
  MeterRow,
  Panel,
  SectionHeader,
  SegmentedControl,
  TextPrompt,
  useListNav,
} from '@launcharr/tui'
import { useState } from 'react'

import {
  PANEL_INFO,
  type PanelId,
  USAGE,
  WIFI,
  fmtTokens,
} from '@/lib/demo-data'

/**
 * The demo's TUI panels, rendered from the *shipping* `@launcharr/tui` components
 * rather than website mock-ups (DECISIONS 2026-08-16). Only the data is fictional;
 * the chrome, keyboard navigation and row selection are the same code the app runs.
 */

const hint = (id: PanelId) => PANEL_INFO.find((p) => p.id === id)?.hint ?? ''

/** `wifi ⏎` — active network pinned, known networks Enter-connect, s scans. */
export function WifiPanel({
  onClose,
  onToast,
}: {
  onClose: () => void
  onToast: (msg: string) => void
}) {
  const [ssid, setSsid] = useState(WIFI.status.ssid)
  const [power, setPower] = useState(true)
  const [scanned, setScanned] = useState<string[] | null>(null)
  const [joining, setJoining] = useState<string | null>(null)

  const known = WIFI.known.filter((n) => n !== ssid)
  const rows = power ? [...known, ...(scanned ?? [])] : []

  const nav = useListNav(rows.length, {
    onActivate: (i) => {
      const target = rows[i]
      if (!target) return
      const isNew = !WIFI.known.includes(target)
      const secured = WIFI.scanned.find((s) => s.ssid === target)?.secured
      if (isNew && secured) {
        setJoining(target)
        return
      }
      setSsid(target)
      onToast(`⏎ joined ${target}  ·  focus returned`)
    },
    onBack: onClose,
  })

  if (joining) {
    return (
      <Panel
        icon="◠"
        title={joining}
        subtitle="enter password to join"
        autoFocus
        footer={
          <KeyHints
            hints={[
              { keys: '↵', label: 'join' },
              { keys: 'esc', label: 'back' },
            ]}
          />
        }
      >
        <TextPrompt
          value=""
          secret
          autoFocus
          sigil="⚿"
          placeholder="network password"
          onChange={() => {}}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setSsid(joining)
              setJoining(null)
              onToast(`⏎ joined ${joining}  ·  focus returned`)
            }
            if (e.key === 'Escape') setJoining(null)
          }}
        />
      </Panel>
    )
  }

  return (
    <Panel
      icon="◠"
      title={power ? ssid : 'Wi-Fi off'}
      subtitle={hint('wifi')}
      autoFocus
      onKeyDown={(e) => {
        if (e.key === 's' && power) {
          setScanned(WIFI.scanned.map((s) => s.ssid))
          return
        }
        if (e.key === 'p') {
          setPower((p) => !p)
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
            { keys: 'p', label: power ? 'power off' : 'power on' },
            { keys: 'esc', label: 'back' },
          ]}
        />
      }
    >
      {power ? (
        <>
          <SectionHeader label="Connected" />
          <ListRow icon="✓" label={ssid} right="secured" />
          <SectionHeader label="Known networks" />
          {known.map((n, i) => (
            <ListRow
              key={n}
              icon="◠"
              label={n}
              selected={nav.index === i}
              onHover={() => nav.setIndex(i)}
              onClick={() => nav.setIndex(i)}
            />
          ))}
          {scanned ? (
            <>
              <SectionHeader label="Nearby" />
              {scanned.map((n, i) => {
                const idx = known.length + i
                return (
                  <ListRow
                    key={n}
                    icon="◠"
                    label={n}
                    right={
                      WIFI.scanned.find((s) => s.ssid === n)?.secured
                        ? '⚿'
                        : 'open'
                    }
                    selected={nav.index === idx}
                    onHover={() => nav.setIndex(idx)}
                    onClick={() => nav.setIndex(idx)}
                  />
                )
              })}
            </>
          ) : (
            <ListRow dim label="press s to scan for nearby networks" />
          )}
        </>
      ) : (
        <ListRow dim label="Wi-Fi is off — press p to turn it back on" />
      )}
    </Panel>
  )
}

/** `dns ⏎` — interface, IP, router, resolver. */
export function DnsPanel({ onClose }: { onClose: () => void }) {
  const s = WIFI.status
  return (
    <Panel
      icon="⇄"
      title="Network"
      subtitle={hint('dns')}
      autoFocus
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
      footer={<KeyHints hints={[{ keys: 'esc', label: 'back' }]} />}
    >
      <SectionHeader label="Connection" />
      <ListRow dim label="Interface" right={s.iface} />
      <ListRow dim label="IP address" right={s.ip} />
      <ListRow dim label="Router" right={s.router} />
      <SectionHeader label="DNS" />
      <ListRow dim label="Resolver" right={s.dns} />
      <ListRow dim label={`${s.dns} is Tailscale MagicDNS`} />
    </Panel>
  )
}

/** `usage ⏎` — tokens by day and model, plus opt-in account limits. */
export function UsagePanel({ onClose }: { onClose: () => void }) {
  const [provider, setProvider] = useState<'claude' | 'codex'>('claude')
  const u = USAGE[provider]
  const peak = Math.max(...u.days.map((d) => d.tokens), 1)
  const modelPeak = Math.max(...u.models.map((m) => m.tokens), 1)

  return (
    <Panel
      icon="▤"
      title="Usage"
      subtitle={hint('usage')}
      autoFocus
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
        if (e.key === 'ArrowLeft') setProvider('claude')
        if (e.key === 'ArrowRight') setProvider('codex')
      }}
      footer={
        <KeyHints
          hints={[
            { keys: '←→', label: 'provider' },
            { keys: 'esc', label: 'back' },
          ]}
        />
      }
    >
      <SegmentedControl
        value={provider}
        onChange={setProvider}
        options={[
          { value: 'claude', label: 'Claude Code' },
          { value: 'codex', label: 'Codex' },
        ]}
      />
      <SectionHeader label="Account limits" right="opt-in" />
      {u.limits.map((l) => (
        <MeterRow
          key={l.name}
          label={l.name}
          value={l.pct}
          max={100}
          right={`${l.pct}% · ${l.resets}`}
        />
      ))}
      <SectionHeader label="Tokens by day" />
      {u.days.map((d) => (
        <MeterRow
          key={d.label}
          label={d.label}
          value={d.tokens}
          max={peak}
          right={fmtTokens(d.tokens)}
        />
      ))}
      <SectionHeader label="By model" />
      {u.models.map((m) => (
        <MeterRow
          key={m.model}
          label={m.model}
          value={m.tokens}
          max={modelPeak}
          right={fmtTokens(m.tokens)}
        />
      ))}
    </Panel>
  )
}

/**
 * Panels that ship in the app but aren't wired to a browser — audio needs
 * CoreAudio, clipboard needs the pasteboard, help needs the live keymap.
 */
export function StubPanel({
  id,
  onClose,
}: {
  id: PanelId
  onClose: () => void
}) {
  const info = PANEL_INFO.find((p) => p.id === id)
  return (
    <Panel
      icon="▤"
      title={info?.title ?? id}
      subtitle={info?.hint}
      autoFocus
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
      footer={<KeyHints hints={[{ keys: 'esc', label: 'back' }]} />}
    >
      <ListRow
        dim
        label={`The ${info?.title ?? id} panel is real, but it needs the machine`}
      />
      <ListRow
        dim
        label="A browser has no CoreAudio, pasteboard or live keymap to read."
      />
      <ListRow dim label="Install launcharr and type this trigger to see it." />
    </Panel>
  )
}
