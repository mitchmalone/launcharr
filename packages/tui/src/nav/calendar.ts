/**
 * Calendar math for the month-grid panel: full display weeks, ISO week labels,
 * month stepping, and the memento-mori style year fraction. Pure date
 * arithmetic — rendering stays in the component.
 */

export type WeekStart = 'sun' | 'mon'

export interface GridDay {
  /** Day of month, 1-based. */
  date: number
  /** 0-based month this cell actually belongs to (may differ from the grid's). */
  month: number
  year: number
  inMonth: boolean
}

export interface GridWeek {
  isoWeek: number
  days: GridDay[]
}

export interface MonthGrid {
  year: number
  /** 0-based. */
  month: number
  weeks: GridWeek[]
}

/** ISO-8601 week number (weeks start Monday; week 1 holds the first Thursday). */
export function isoWeek(d: Date): number {
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = utc.getUTCDay() || 7
  utc.setUTCDate(utc.getUTCDate() + 4 - day)
  const yearStart = Date.UTC(utc.getUTCFullYear(), 0, 1)
  return Math.ceil(((utc.getTime() - yearStart) / 86_400_000 + 1) / 7)
}

/**
 * The full-week grid containing `month`, padded with adjacent-month days.
 * Each week is labeled with the ISO week of its Monday (for Sunday-start rows
 * that Monday is the second cell — six of the seven days agree with it).
 */
export function monthGrid(
  year: number,
  month: number,
  weekStart: WeekStart = 'sun',
): MonthGrid {
  const startDow = weekStart === 'sun' ? 0 : 1
  const lead = (new Date(year, month, 1).getDay() - startDow + 7) % 7
  const cursor = new Date(year, month, 1 - lead)
  const lastOfMonth = new Date(year, month + 1, 0)
  const mondayIdx = weekStart === 'sun' ? 1 : 0
  const weeks: GridWeek[] = []
  do {
    const days: GridDay[] = []
    for (let i = 0; i < 7; i++) {
      days.push({
        date: cursor.getDate(),
        month: cursor.getMonth(),
        year: cursor.getFullYear(),
        inMonth: cursor.getMonth() === month && cursor.getFullYear() === year,
      })
      cursor.setDate(cursor.getDate() + 1)
    }
    const anchor = days[mondayIdx]!
    weeks.push({
      isoWeek: isoWeek(new Date(anchor.year, anchor.month, anchor.date)),
      days,
    })
  } while (cursor.getTime() <= lastOfMonth.getTime())
  return { year, month, weeks }
}

export function stepMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const total = year * 12 + month + delta
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 }
}

/** Fraction of `date`'s year elapsed at end of that day, 0..1. */
export function yearProgress(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 1)
  const end = new Date(date.getFullYear() + 1, 0, 1)
  const done = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime()
  return (done - start.getTime()) / (end.getTime() - start.getTime())
}
