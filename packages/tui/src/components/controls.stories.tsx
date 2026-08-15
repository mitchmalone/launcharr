import { useState } from 'react'

import { defineStories } from '../story'
import { MeterRow, SegmentedControl, Slider, Toggle } from './controls'
import { Panel, SectionHeader } from './primitives'

function LiveSlider({ start }: { start: number }) {
  const [v, setV] = useState(start)
  return (
    <>
      <SectionHeader label="Output" right={`${v}%`} />
      <Slider value={v} onChange={setV} step={5} label="Output" />
    </>
  )
}

function LiveToggle({ start }: { start: boolean }) {
  const [on, setOn] = useState(start)
  return <Toggle checked={on} onChange={setOn} label="story toggle" />
}

function LiveSegmented() {
  const [v, setV] = useState('cloudflare')
  return (
    <SegmentedControl
      value={v}
      onChange={setV}
      options={[
        { value: 'dhcp', label: 'DHCP' },
        { value: 'cloudflare', label: 'Cloudflare' },
        { value: 'google', label: 'Google' },
        { value: 'custom', label: 'Custom' },
      ]}
    />
  )
}

export const sliderStories = defineStories('Slider', [
  {
    name: 'interactive',
    keys: '←→↑↓ step · pgup/pgdn ×10 · click/drag seeks',
    render: () => (
      <Panel>
        <LiveSlider start={30} />
      </Panel>
    ),
  },
  {
    name: 'extremes',
    render: () => (
      <Panel>
        <SectionHeader label="Zero" right="0%" />
        <Slider value={0} onChange={() => {}} />
        <SectionHeader label="Full" right="100%" />
        <Slider value={100} onChange={() => {}} />
      </Panel>
    ),
  },
])

export const toggleStories = defineStories('Toggle', [
  {
    name: 'off and on (interactive)',
    keys: 'click toggles · space/enter when focused',
    render: () => (
      <Panel>
        <LiveToggle start={false} />
        <LiveToggle start={true} />
      </Panel>
    ),
  },
])

export const segmentedStories = defineStories('SegmentedControl', [
  {
    name: 'four options (interactive)',
    render: () => (
      <Panel>
        <LiveSegmented />
      </Panel>
    ),
  },
  {
    name: 'two options',
    render: () => (
      <Panel>
        <SegmentedControl
          value="a"
          onChange={() => {}}
          options={[
            { value: 'a', label: 'On' },
            { value: 'b', label: 'Off' },
          ]}
        />
      </Panel>
    ),
  },
])

export const meterStories = defineStories('MeterRow', [
  {
    name: 'labeled set with emphasis',
    render: () => (
      <Panel>
        <MeterRow label="Mon" value={218.2} max={220} right="218.2M" />
        <MeterRow label="Tue" value={12.4} max={220} right="12.4M" />
        <MeterRow label="Today" value={96.1} max={220} right="96.1M" emphasis />
      </Panel>
    ),
  },
  {
    name: 'bare track (no label/right)',
    render: () => (
      <Panel>
        <MeterRow value={0.23} />
      </Panel>
    ),
  },
  {
    name: 'overflow clamps',
    notes: 'value > max must pin at 100%, never escape the track.',
    render: () => (
      <Panel>
        <MeterRow label="OVER" value={500} max={100} right="500%" />
        <MeterRow label="ZERO" value={0} max={100} right="0" />
      </Panel>
    ),
  },
])
