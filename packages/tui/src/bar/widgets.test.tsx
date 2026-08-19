import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { BarWidgetCard, BarWidgetCell } from './components'
import type { BarHoverApi, BarWidget } from './types'

/** Structural checks on the SSR markup for a user widget (docs/WIDGETS.md). */

const hover = (hovered: string | null): BarHoverApi => ({
  hovered,
  enter: () => {},
  leave: () => {},
  stay: () => {},
  cardRef: () => {},
})

const now = new Date(1_000_000 * 1000)

const uptime: BarWidget = {
  id: 'uptime',
  name: 'Uptime',
  zone: 'right',
  icon: 'arrow-big-up',
  view: {
    icon: 'arrow-big-down',
    label: '2',
    tone: 'error',
    click: { type: 'open', value: 'https://status.example' },
    card: {
      title: 'Uptime',
      subtitle: '2 of 9 down',
      rows: [
        {
          dot: 'ok',
          text: 'mitchmalone.com',
          hint: '238 ms',
          action: { type: 'open', value: 'https://mitchmalone.com' },
        },
        { dot: 'error', text: 'psyke.co', hint: 'down' },
      ],
      hint: 'click a site to open it',
    },
  },
  error: null,
  lastOk: 1_000_000 - 30,
  updatedAt: 1_000_000 - 30,
}

describe('BarWidgetCell', () => {
  it('renders the tone, label and hover id from the tick', () => {
    const html = renderToStaticMarkup(
      <BarWidgetCell widget={uptime} now={now} hover={hover(null)} />,
    )
    expect(html).toContain('data-hover="widget:uptime"')
    expect(html).toContain('bar-tone-error')
    expect(html).toContain('>2<')
    expect(html).not.toContain('bar-widget-card')
  })

  it('wears the error tone but keeps the last view when a tick failed', () => {
    const failing = {
      ...uptime,
      error: 'exit 1: boom',
      view: { ...uptime.view, tone: 'ok' },
    }
    const html = renderToStaticMarkup(
      <BarWidgetCell
        widget={failing}
        now={now}
        hover={hover('widget:uptime')}
      />,
    )
    expect(html).toContain('bar-tone-error')
    expect(html).toContain('bar-widget-health')
    expect(html).toContain('exit 1: boom · last ok 30s ago')
    expect(html).toContain('mitchmalone.com')
  })

  it('renders nothing for a hidden view, a plain cell without hover', () => {
    const hidden = { ...uptime, view: { hidden: true } }
    expect(
      renderToStaticMarkup(<BarWidgetCell widget={hidden} now={now} />),
    ).toBe('')
    const plain = renderToStaticMarkup(
      <BarWidgetCell widget={uptime} now={now} />,
    )
    expect(plain).toContain('bar-cell bar-tone-error')
    expect(plain).not.toContain('data-hover')
  })
})

describe('BarWidgetCard', () => {
  it('lists rows with dots and hints; only actionable rows are buttons', () => {
    const html = renderToStaticMarkup(
      <BarWidgetCard widget={uptime} now={now} onAction={() => {}} />,
    )
    expect(html).toContain('bar-widget-card')
    expect(html).toContain('2 of 9 down')
    expect(html).toContain('bar-widget-dot bar-tone-ok')
    expect(html).toContain('bar-widget-dot bar-tone-error')
    expect(html).toContain('238 ms')
    expect(html).toContain('click a site to open it')
    // One button (the actionable row), one plain div row.
    expect(html.match(/bar-widget-row-action/g)?.length).toBe(1)
    expect(html.match(/class="bar-widget-row[ "]/g)?.length).toBe(2)
  })

  it('shows a waiting hint before the first tick', () => {
    const fresh = { ...uptime, view: null, lastOk: null, updatedAt: null }
    const html = renderToStaticMarkup(
      <BarWidgetCard widget={fresh} now={now} />,
    )
    expect(html).toContain('waiting for the first tick')
    expect(html).toContain('Uptime')
  })
})
