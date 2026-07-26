import { BudgetPeriod } from '../models/flow';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function normalizeDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/** `[start, end)` bounds of the calendar period (month or year) containing `date`. */
function periodBounds(period: BudgetPeriod, date: Date): { start: Date; end: Date } {
  if (period === 'month') {
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
    return { start, end };
  }
  const start = new Date(date.getFullYear(), 0, 1);
  const end = new Date(date.getFullYear() + 1, 0, 1);
  return { start, end };
}

/**
 * A budget-kind Flow's expected contribution over `(startExclusive, endInclusive]`, prorated
 * by the fraction of each calendar period's days the range covers. No rollover: each period's
 * proration is against its own full limit, independent of any other period's over/under-spend.
 *
 * The spec doesn't say when within a period a budget's spend is expected to land, so this
 * spreads it evenly across the period's days rather than assuming a lump sum at either edge —
 * the least arbitrary choice, and it keeps the day-by-day scrubbed balance line smooth.
 */
export function budgetContribution(
  period: BudgetPeriod,
  limit: number,
  startExclusive: Date,
  endInclusive: Date,
): number {
  if (endInclusive.getTime() <= startExclusive.getTime()) return 0;

  const rangeStart = addDays(normalizeDay(startExclusive), 1);
  const rangeEnd = addDays(normalizeDay(endInclusive), 1);

  let total = 0;
  let cursor = periodBounds(period, rangeStart).start;
  while (cursor.getTime() < rangeEnd.getTime()) {
    const { start, end } = periodBounds(period, cursor);
    const overlapStart = Math.max(start.getTime(), rangeStart.getTime());
    const overlapEnd = Math.min(end.getTime(), rangeEnd.getTime());
    const overlapDays = Math.max(0, (overlapEnd - overlapStart) / MS_PER_DAY);
    const totalDaysInPeriod = (end.getTime() - start.getTime()) / MS_PER_DAY;

    total += limit * (overlapDays / totalDaysInPeriod);
    cursor = end;
  }

  return total;
}
