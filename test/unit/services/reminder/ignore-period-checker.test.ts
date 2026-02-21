import { describe, it, expect } from 'vitest'
import {
  isInIgnorePeriod,
  isWeekend,
  parseTime,
} from '@/services/reminder/ignore-period-checker'
import type { IgnorePeriod } from '@/types/settings'

describe('parseTime', () => {
  it('should parse "00:00" to { hours: 0, minutes: 0 }', () => {
    expect(parseTime('00:00')).toEqual({ hours: 0, minutes: 0 })
  })

  it('should parse "23:59" to { hours: 23, minutes: 59 }', () => {
    expect(parseTime('23:59')).toEqual({ hours: 23, minutes: 59 })
  })

  it('should parse "09:05" correctly', () => {
    expect(parseTime('09:05')).toEqual({ hours: 9, minutes: 5 })
  })

  it('should parse "12:30" correctly', () => {
    expect(parseTime('12:30')).toEqual({ hours: 12, minutes: 30 })
  })
})

describe('isWeekend', () => {
  it('should return true for Saturday', () => {
    // 2026-02-21 is Saturday
    const saturday = new Date(2026, 1, 21, 12, 0)
    expect(isWeekend(saturday)).toBe(true)
  })

  it('should return true for Sunday', () => {
    // 2026-02-22 is Sunday
    const sunday = new Date(2026, 1, 22, 12, 0)
    expect(isWeekend(sunday)).toBe(true)
  })

  it('should return false for Monday', () => {
    // 2026-02-23 is Monday
    const monday = new Date(2026, 1, 23, 12, 0)
    expect(isWeekend(monday)).toBe(false)
  })

  it('should return false for Friday', () => {
    // 2026-02-20 is Friday
    const friday = new Date(2026, 1, 20, 12, 0)
    expect(isWeekend(friday)).toBe(false)
  })

  it('should return false for Wednesday', () => {
    // 2026-02-18 is Wednesday
    const wednesday = new Date(2026, 1, 18, 12, 0)
    expect(isWeekend(wednesday)).toBe(false)
  })
})

describe('isInIgnorePeriod', () => {
  describe('empty periods', () => {
    it('should return false when no periods and weekendIgnore is false', () => {
      expect(isInIgnorePeriod([], false, new Date(2026, 1, 23, 12, 0))).toBe(false)
    })

    it('should return false when no periods and weekendIgnore is true on weekday', () => {
      const monday = new Date(2026, 1, 23, 12, 0)
      expect(isInIgnorePeriod([], true, monday)).toBe(false)
    })
  })

  describe('weekend ignore', () => {
    it('should return true on Saturday when weekendIgnore is true', () => {
      const saturday = new Date(2026, 1, 21, 12, 0)
      expect(isInIgnorePeriod([], true, saturday)).toBe(true)
    })

    it('should return true on Sunday when weekendIgnore is true', () => {
      const sunday = new Date(2026, 1, 22, 12, 0)
      expect(isInIgnorePeriod([], true, sunday)).toBe(true)
    })

    it('should return false on Saturday when weekendIgnore is false', () => {
      const saturday = new Date(2026, 1, 21, 12, 0)
      expect(isInIgnorePeriod([], false, saturday)).toBe(false)
    })

    it('should return false on weekday when weekendIgnore is true', () => {
      const monday = new Date(2026, 1, 23, 12, 0)
      expect(isInIgnorePeriod([], true, monday)).toBe(false)
    })
  })

  describe('single normal period (no midnight crossing)', () => {
    const lunchBreak: IgnorePeriod = { start: '12:00', end: '13:00' }

    it('should return true when time is within the period', () => {
      const noon = new Date(2026, 1, 23, 12, 30, 0)
      expect(isInIgnorePeriod([lunchBreak], false, noon)).toBe(true)
    })

    it('should return true at the exact start time', () => {
      const start = new Date(2026, 1, 23, 12, 0, 0)
      expect(isInIgnorePeriod([lunchBreak], false, start)).toBe(true)
    })

    it('should return false at the exact end time', () => {
      const end = new Date(2026, 1, 23, 13, 0, 0)
      expect(isInIgnorePeriod([lunchBreak], false, end)).toBe(false)
    })

    it('should return false when time is before the period', () => {
      const morning = new Date(2026, 1, 23, 11, 59, 0)
      expect(isInIgnorePeriod([lunchBreak], false, morning)).toBe(false)
    })

    it('should return false when time is after the period', () => {
      const afternoon = new Date(2026, 1, 23, 13, 1, 0)
      expect(isInIgnorePeriod([lunchBreak], false, afternoon)).toBe(false)
    })
  })

  describe('cross-midnight period (e.g. 23:00-01:00)', () => {
    const nightPeriod: IgnorePeriod = { start: '23:00', end: '01:00' }

    it('should return true at 23:30 (after start, before midnight)', () => {
      const lateNight = new Date(2026, 1, 23, 23, 30, 0)
      expect(isInIgnorePeriod([nightPeriod], false, lateNight)).toBe(true)
    })

    it('should return true at 00:30 (after midnight, before end)', () => {
      const earlyMorning = new Date(2026, 1, 24, 0, 30, 0)
      expect(isInIgnorePeriod([nightPeriod], false, earlyMorning)).toBe(true)
    })

    it('should return true at 23:00 (exact start)', () => {
      const start = new Date(2026, 1, 23, 23, 0, 0)
      expect(isInIgnorePeriod([nightPeriod], false, start)).toBe(true)
    })

    it('should return false at 01:00 (exact end)', () => {
      const end = new Date(2026, 1, 24, 1, 0, 0)
      expect(isInIgnorePeriod([nightPeriod], false, end)).toBe(false)
    })

    it('should return false at 22:59 (just before start)', () => {
      const beforeStart = new Date(2026, 1, 23, 22, 59, 0)
      expect(isInIgnorePeriod([nightPeriod], false, beforeStart)).toBe(false)
    })

    it('should return false at 01:01 (just after end)', () => {
      const afterEnd = new Date(2026, 1, 24, 1, 1, 0)
      expect(isInIgnorePeriod([nightPeriod], false, afterEnd)).toBe(false)
    })

    it('should return true at midnight exactly', () => {
      const midnight = new Date(2026, 1, 24, 0, 0, 0)
      expect(isInIgnorePeriod([nightPeriod], false, midnight)).toBe(true)
    })
  })

  describe('multiple periods', () => {
    const periods: IgnorePeriod[] = [
      { start: '12:00', end: '13:00' },  // lunch
      { start: '18:00', end: '19:00' },  // dinner
    ]

    it('should return true when time is in first period', () => {
      const noon = new Date(2026, 1, 23, 12, 30, 0)
      expect(isInIgnorePeriod(periods, false, noon)).toBe(true)
    })

    it('should return true when time is in second period', () => {
      const dinner = new Date(2026, 1, 23, 18, 30, 0)
      expect(isInIgnorePeriod(periods, false, dinner)).toBe(true)
    })

    it('should return false when time is between periods', () => {
      const afternoon = new Date(2026, 1, 23, 15, 0, 0)
      expect(isInIgnorePeriod(periods, false, afternoon)).toBe(false)
    })
  })

  describe('multiple periods with cross-midnight', () => {
    const periods: IgnorePeriod[] = [
      { start: '12:00', end: '13:00' },
      { start: '23:00', end: '02:00' },
    ]

    it('should return true at 12:30 (in first period)', () => {
      const noon = new Date(2026, 1, 23, 12, 30, 0)
      expect(isInIgnorePeriod(periods, false, noon)).toBe(true)
    })

    it('should return true at 00:30 (in cross-midnight period)', () => {
      const earlyMorning = new Date(2026, 1, 24, 0, 30, 0)
      expect(isInIgnorePeriod(periods, false, earlyMorning)).toBe(true)
    })

    it('should return false at 15:00 (between periods)', () => {
      const afternoon = new Date(2026, 1, 23, 15, 0, 0)
      expect(isInIgnorePeriod(periods, false, afternoon)).toBe(false)
    })
  })

  describe('same start and end (full day)', () => {
    const fullDay: IgnorePeriod = { start: '00:00', end: '00:00' }

    it('should return false when start equals end (empty period)', () => {
      const noon = new Date(2026, 1, 23, 12, 0, 0)
      expect(isInIgnorePeriod([fullDay], false, noon)).toBe(false)
    })
  })

  describe('weekend + periods combined', () => {
    const lunchBreak: IgnorePeriod = { start: '12:00', end: '13:00' }

    it('should return true on weekend even if not in any period', () => {
      const saturday10am = new Date(2026, 1, 21, 10, 0, 0)
      expect(isInIgnorePeriod([lunchBreak], true, saturday10am)).toBe(true)
    })

    it('should return true on weekday during period with weekendIgnore on', () => {
      const mondayNoon = new Date(2026, 1, 23, 12, 30, 0)
      expect(isInIgnorePeriod([lunchBreak], true, mondayNoon)).toBe(true)
    })

    it('should return false on weekday outside period with weekendIgnore on', () => {
      const mondayMorning = new Date(2026, 1, 23, 9, 0, 0)
      expect(isInIgnorePeriod([lunchBreak], true, mondayMorning)).toBe(false)
    })
  })

  describe('defaults to current time', () => {
    it('should use current time when now is not provided', () => {
      // Just verify it doesn't throw; the result depends on current time
      expect(() => isInIgnorePeriod([], false)).not.toThrow()
    })
  })
})
