import { monthGrid } from '../nav/calendar'
import type { WeekStart } from '../nav/calendar'

const DOW_SUN = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const DOW_MON = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
const MONTHS = [
  'JANUARY',
  'FEBRUARY',
  'MARCH',
  'APRIL',
  'MAY',
  'JUNE',
  'JULY',
  'AUGUST',
  'SEPTEMBER',
  'OCTOBER',
  'NOVEMBER',
  'DECEMBER',
]

/**
 * Month grid with ISO week column and ‹ month › stepper footer. Pure
 * presentation over `monthGrid`; stepping is the caller's state.
 */
export function Calendar({
  year,
  month,
  selected,
  weekStart = 'sun',
  onStep,
}: {
  year: number
  /** 0-based. */
  month: number
  /** Boxed day, e.g. today. */
  selected?: { year: number; month: number; date: number }
  weekStart?: WeekStart
  onStep?: (delta: number) => void
}) {
  const grid = monthGrid(year, month, weekStart)
  const dow = weekStart === 'sun' ? DOW_SUN : DOW_MON
  return (
    <div className="tui-calendar">
      <div className="tui-cal-grid">
        <span className="tui-cal-dow">W</span>
        {dow.map((d) => (
          <span key={d} className="tui-cal-dow">
            {d}
          </span>
        ))}
        {grid.weeks.map((week) => [
          <span key={`w${week.isoWeek}`} className="tui-cal-week">
            {week.isoWeek}
          </span>,
          ...week.days.map((day) => {
            const isSelected =
              selected &&
              day.year === selected.year &&
              day.month === selected.month &&
              day.date === selected.date
            const cls = [
              'tui-cal-day',
              !day.inMonth && 'tui-cal-out',
              isSelected && 'tui-cal-selected',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <span
                key={`${day.year}-${day.month}-${day.date}`}
                className={cls}
              >
                {day.date}
              </span>
            )
          }),
        ])}
      </div>
      <div className="tui-cal-foot">
        <button
          type="button"
          className="tui-cal-step"
          aria-label="Previous month"
          onClick={() => onStep?.(-1)}
        >
          ‹
        </button>
        <span className="tui-cal-title">
          {MONTHS[month]} {year}
        </span>
        <button
          type="button"
          className="tui-cal-step"
          aria-label="Next month"
          onClick={() => onStep?.(1)}
        >
          ›
        </button>
      </div>
    </div>
  )
}
