import type { AwakeSpec, AwakeStatus } from '@launcharr/core/awake'
import { untilDeadline } from '@launcharr/core/awake'
import { invoke } from '@tauri-apps/api/core'
import { useCallback, useEffect, useState } from 'react'

import type { AwakeReadings } from '../lib/awake'
import type { Config } from '../lib/config'
import { AwakePanel } from './AwakePanel'

const STATUS_MS = 2000
const READINGS_MS = 5000

/**
 * Wires AwakePanel to the awake_* commands. `awake_status` spawns `pmset`
 * for the holders list — panel-open cadence only; `awake_readings` (full)
 * feeds the app picker, SSID row, and the agents-active default.
 */
export function AwakePanelContainer({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<AwakeStatus | null>(null)
  const [readings, setReadings] = useState<AwakeReadings | null>(null)
  const [monitorOn, setMonitorOn] = useState(false)

  useEffect(() => {
    invoke<Config>('read_config')
      .then((c) => setMonitorOn(c.agents.monitor))
      .catch(console.error)
  }, [])

  useEffect(() => {
    const refresh = () =>
      invoke<AwakeStatus>('awake_status').then(setStatus).catch(console.error)
    refresh()
    const id = setInterval(refresh, STATUS_MS)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const refresh = () =>
      invoke<AwakeReadings>('awake_readings', {
        apps: true,
        display: true,
        net: false,
      })
        .then(setReadings)
        .catch(console.error)
    refresh()
    const id = setInterval(refresh, READINGS_MS)
    return () => clearInterval(id)
  }, [])

  const refreshStatus = useCallback(() => {
    invoke<AwakeStatus>('awake_status').then(setStatus).catch(console.error)
  }, [])

  const onArm = useCallback(
    (spec: AwakeSpec) => {
      invoke('awake_arm', {
        display: spec.screen,
        disks: spec.disks,
        untilEpochMs: untilDeadline(spec.until, new Date()),
        batteryFloor: spec.floor,
        spec: JSON.stringify(spec),
      })
        .then(refreshStatus)
        .catch(console.error)
    },
    [refreshStatus],
  )

  const onRelease = useCallback(() => {
    invoke('awake_release').then(refreshStatus).catch(console.error)
  }, [refreshStatus])

  const reading = readings?.reading
  return (
    <AwakePanel
      status={status}
      agentsActive={
        reading?.agentStates.some(
          (s) => s === 'working' || s === 'attention',
        ) ?? false
      }
      agentsMonitorOn={monitorOn}
      runningApps={reading?.runningApps ?? []}
      currentSsid={reading?.ssid ?? null}
      onArm={onArm}
      onRelease={onRelease}
      onClose={onClose}
    />
  )
}
