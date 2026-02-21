import type { IgnorePeriod } from '@/types/settings'

export interface ParsedTime {
  readonly hours: number
  readonly minutes: number
}

/**
 * Parse "HH:MM" string into hours and minutes.
 */
export function parseTime(time: string): ParsedTime {
  const [hours, minutes] = time.split(':').map(Number)
  return { hours, minutes }
}

/**
 * Check if a Date falls on a weekend (Saturday or Sunday).
 */
export function isWeekend(date: Date): boolean {
  const day = date.getDay()
  return day === 0 || day === 6
}

/**
 * Convert hours and minutes to total minutes since midnight.
 */
function toMinutesSinceMidnight(hours: number, minutes: number): number {
  return hours * 60 + minutes
}

/**
 * Check if the current time falls within a single ignore period.
 * Handles cross-midnight periods (e.g. 23:00-01:00).
 *
 * Start is inclusive, end is exclusive: [start, end)
 */
function isInSinglePeriod(period: IgnorePeriod, now: Date): boolean {
  const start = parseTime(period.start)
  const end = parseTime(period.end)

  const startMinutes = toMinutesSinceMidnight(start.hours, start.minutes)
  const endMinutes = toMinutesSinceMidnight(end.hours, end.minutes)
  const nowMinutes = toMinutesSinceMidnight(now.getHours(), now.getMinutes())

  // Same start and end means empty period
  if (startMinutes === endMinutes) {
    return false
  }

  if (startMinutes < endMinutes) {
    // Normal period (e.g. 12:00-13:00)
    return nowMinutes >= startMinutes && nowMinutes < endMinutes
  }

  // Cross-midnight period (e.g. 23:00-01:00)
  // Time is in period if it's >= start OR < end
  return nowMinutes >= startMinutes || nowMinutes < endMinutes
}

/**
 * Check if the current time is in any ignore period,
 * or if it's a weekend with weekendIgnore enabled.
 *
 * @param periods - Array of ignore periods
 * @param weekendIgnore - Whether to ignore detection on weekends
 * @param now - Current time (defaults to new Date())
 * @returns true if reminders should be suppressed
 */
export function isInIgnorePeriod(
  periods: readonly IgnorePeriod[],
  weekendIgnore: boolean,
  now: Date = new Date(),
): boolean {
  if (weekendIgnore && isWeekend(now)) {
    return true
  }

  return periods.some((period) => isInSinglePeriod(period, now))
}
