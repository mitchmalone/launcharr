import { useState } from 'react'

import { defineStories } from '../story'
import { Calendar } from './calendar'
import { MeterRow } from './controls'
import { Panel } from './primitives'

function SteppableCalendar() {
  const [view, setView] = useState({ year: 2026, month: 7 })
  return (
    <Calendar
      year={view.year}
      month={view.month}
      selected={{ year: 2026, month: 7, date: 14 }}
      onStep={(d) => {
        const total = view.year * 12 + view.month + d
        setView({
          year: Math.floor(total / 12),
          month: ((total % 12) + 12) % 12,
        })
      }}
    />
  )
}

export const calendarStories = defineStories('Calendar', [
  {
    name: 'august 2026, selected day (reference month)',
    notes: 'ISO week column must read 31–36; Aug 14 boxed.',
    keys: '‹ › step months',
    render: () => (
      <Panel icon="▦" title="August 14">
        <MeterRow label="2026" value={0.62} right="62%" />
        <MeterRow label="LIFE" value={0.52} right="52%" />
        <SteppableCalendar />
      </Panel>
    ),
  },
  {
    name: 'monday start',
    render: () => (
      <Panel>
        <Calendar year={2026} month={7} weekStart="mon" />
      </Panel>
    ),
  },
  {
    name: 'february (short month)',
    render: () => (
      <Panel>
        <Calendar year={2026} month={1} />
      </Panel>
    ),
  },
])
