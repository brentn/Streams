import { Cadence, DayOfWeek, MonthAnchor } from '../models/flow';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

function startOfWeek(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() - result.getDay());
  return result;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function dayOfMonthAnchor(year: number, month: number, day: number): Date {
  return new Date(year, month, Math.min(day, daysInMonth(year, month)));
}

function nthWeekdayOfMonth(year: number, month: number, nth: number, dayOfWeek: DayOfWeek): Date {
  if (nth === -1) {
    const last = new Date(year, month + 1, 0);
    const back = mod(last.getDay() - dayOfWeek, 7);
    return new Date(year, month, last.getDate() - back);
  }
  const first = new Date(year, month, 1);
  const forward = mod(dayOfWeek - first.getDay(), 7);
  return new Date(year, month, 1 + forward + (nth - 1) * 7);
}

function monthAnchorOccurrence(anchor: MonthAnchor, year: number, month: number): Date {
  return 'day' in anchor
    ? dayOfMonthAnchor(year, month, anchor.day)
    : nthWeekdayOfMonth(year, month, anchor.nth, anchor.dayOfWeek);
}

function inRange(date: Date, startExclusive: Date, endInclusive: Date): boolean {
  return date.getTime() > startExclusive.getTime() && date.getTime() <= endInclusive.getTime();
}

function weekOccurrences(cadence: Cadence & { period: 'week' }, startExclusive: Date, endInclusive: Date): Date[] {
  const anchorWeekStart = startOfWeek(cadence.anchorDate);
  const results: Date[] = [];

  let weekStart = startOfWeek(startExclusive);
  while (weekStart.getTime() <= endInclusive.getTime()) {
    const weeksSinceAnchor = Math.round((weekStart.getTime() - anchorWeekStart.getTime()) / (7 * MS_PER_DAY));
    if (mod(weeksSinceAnchor, cadence.interval) === 0) {
      for (const anchor of cadence.anchors) {
        const occurrence = addDays(weekStart, anchor.dayOfWeek);
        if (inRange(occurrence, startExclusive, endInclusive)) {
          results.push(occurrence);
        }
      }
    }
    weekStart = addDays(weekStart, 7);
  }
  return results;
}

function monthOccurrences(cadence: Cadence & { period: 'month' }, startExclusive: Date, endInclusive: Date): Date[] {
  const results: Date[] = [];

  let cursor = new Date(startExclusive.getFullYear(), startExclusive.getMonth(), 1);
  const endCursor = new Date(endInclusive.getFullYear(), endInclusive.getMonth(), 1);
  while (cursor.getTime() <= endCursor.getTime()) {
    const monthsSinceAnchor =
      (cursor.getFullYear() - cadence.anchorDate.getFullYear()) * 12 +
      (cursor.getMonth() - cadence.anchorDate.getMonth());
    if (mod(monthsSinceAnchor, cadence.interval) === 0) {
      for (const anchor of cadence.anchors) {
        const occurrence = monthAnchorOccurrence(anchor, cursor.getFullYear(), cursor.getMonth());
        if (inRange(occurrence, startExclusive, endInclusive)) {
          results.push(occurrence);
        }
      }
    }
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return results;
}

function yearOccurrences(cadence: Cadence & { period: 'year' }, startExclusive: Date, endInclusive: Date): Date[] {
  const results: Date[] = [];

  for (let year = startExclusive.getFullYear(); year <= endInclusive.getFullYear(); year++) {
    const yearsSinceAnchor = year - cadence.anchorDate.getFullYear();
    if (mod(yearsSinceAnchor, cadence.interval) === 0) {
      for (const anchor of cadence.anchors) {
        const occurrence = new Date(year, anchor.month - 1, anchor.day);
        if (inRange(occurrence, startExclusive, endInclusive)) {
          results.push(occurrence);
        }
      }
    }
  }
  return results;
}

/**
 * All of a recurring-kind Flow's expected occurrence dates in `(startExclusive, endInclusive]`.
 * `cadence.anchorDate` fixes interval parity (which week/month is "on") — see the Flow model.
 */
export function occurrencesInRange(cadence: Cadence, startExclusive: Date, endInclusive: Date): Date[] {
  if (endInclusive.getTime() <= startExclusive.getTime()) return [];

  let results: Date[];
  switch (cadence.period) {
    case 'week':
      results = weekOccurrences(cadence, startExclusive, endInclusive);
      break;
    case 'month':
      results = monthOccurrences(cadence, startExclusive, endInclusive);
      break;
    case 'year':
      results = yearOccurrences(cadence, startExclusive, endInclusive);
      break;
  }
  return results.sort((a, b) => a.getTime() - b.getTime());
}
