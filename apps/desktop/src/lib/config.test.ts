import { describe, expect, it } from 'vitest'

import {
  DEFAULT_BAR_LAYOUT,
  normalizeBarZones,
  notchedZones,
  widgetModuleId,
} from './config'

const ids = (list: { id: string }[]) => list.map((m) => m.id)

describe('normalizeBarZones with widgets', () => {
  it('places a discovered widget in its manifest zone when the layout lacks it', () => {
    const out = normalizeBarZones(DEFAULT_BAR_LAYOUT, [
      { id: 'uptime', zone: 'right' },
      { id: 'clockish', zone: 'center' },
      { id: 'odd', zone: 'nowhere' },
    ])
    expect(ids(out.right)).toEqual([
      'wifi',
      'awake',
      'battery',
      'widget:uptime',
      'widget:odd',
    ])
    expect(ids(out.center)).toEqual(['clock', 'widget:clockish'])
  })

  it('keeps widget ids where the layout put them, even unknown to the caller', () => {
    const layout = {
      left: [
        { id: 'widget:vercel', enabled: false },
        { id: 'workspaces', enabled: true },
      ],
      center: [{ id: 'clock', enabled: true }],
      right: [{ id: 'battery', enabled: true }],
    }
    const out = normalizeBarZones(layout, [{ id: 'vercel', zone: 'right' }])
    expect(out.left[0]).toEqual({ id: 'widget:vercel', enabled: false })
    expect(ids(out.right)).not.toContain('widget:vercel')
    // Non-widget unknowns still drop.
    const dropped = normalizeBarZones({
      ...layout,
      right: [{ id: 'bogus', enabled: true }],
    })
    expect(ids(dropped.right)).not.toContain('bogus')
  })

  it('folds widgets into the notched arrangement like any module', () => {
    const out = notchedZones({ enabled: true, layout: DEFAULT_BAR_LAYOUT }, [
      { id: 'gh', zone: 'center' },
    ])
    expect(out.center).toEqual([])
    expect(ids(out.right)).toEqual([
      'clock',
      widgetModuleId('gh'),
      'wifi',
      'awake',
      'battery',
    ])
  })
})
