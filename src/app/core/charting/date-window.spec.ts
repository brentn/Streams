import { describe, expect, it } from 'vitest';
import {
  boundaryXFor,
  buildWindowDates,
  clampDayOffset,
  diffDays,
  HALF_WINDOW_DAYS,
  SCRUB_MAX_DAYS,
  SCRUB_MIN_DAYS,
  selectedDateFor,
  WINDOW_DAYS,
} from './date-window';

describe('buildWindowDates', () => {
  it('builds a window of WINDOW_DAYS dates centered on the given date', () => {
    const center = new Date('2026-07-25T15:30:00Z');

    const dates = buildWindowDates(center);

    expect(dates).toHaveLength(WINDOW_DAYS);
    expect(dates[HALF_WINDOW_DAYS].getFullYear()).toBe(2026);
    expect(dates[HALF_WINDOW_DAYS].getMonth()).toBe(6);
    expect(dates[HALF_WINDOW_DAYS].getDate()).toBe(25);
    expect(dates[HALF_WINDOW_DAYS].getHours()).toBe(0);
  });

  it('spans one day per index', () => {
    const dates = buildWindowDates(new Date('2026-01-15'));
    expect(diffDays(dates[1], dates[0])).toBe(1);
    expect(diffDays(dates.at(-1)!, dates[0])).toBe(WINDOW_DAYS - 1);
  });
});

describe('diffDays', () => {
  it('counts whole calendar days regardless of time-of-day', () => {
    expect(diffDays(new Date('2026-07-26T23:00:00'), new Date('2026-07-25T01:00:00'))).toBe(1);
  });

  it('is negative when a is before b', () => {
    expect(diffDays(new Date('2026-07-24'), new Date('2026-07-25'))).toBe(-1);
  });
});

describe('clampDayOffset', () => {
  it('passes values within bounds through unchanged', () => {
    expect(clampDayOffset(0)).toBe(0);
    expect(clampDayOffset(100)).toBe(100);
  });

  it('clamps to SCRUB_MAX_DAYS and SCRUB_MIN_DAYS', () => {
    expect(clampDayOffset(SCRUB_MAX_DAYS + 1)).toBe(SCRUB_MAX_DAYS);
    expect(clampDayOffset(SCRUB_MIN_DAYS - 1)).toBe(SCRUB_MIN_DAYS);
  });
});

describe('selectedDateFor', () => {
  it('returns today, normalized to midnight, for a zero offset', () => {
    const result = selectedDateFor(0);
    expect(diffDays(result, new Date())).toBe(0);
    expect(result.getHours()).toBe(0);
  });

  it('adds the offset in whole days', () => {
    expect(diffDays(selectedDateFor(10), selectedDateFor(0))).toBe(10);
    expect(diffDays(selectedDateFor(-5), selectedDateFor(0))).toBe(-5);
  });
});

describe('boundaryXFor', () => {
  it('is HALF_WINDOW_DAYS when balanceDate equals the selected date (window centered on today)', () => {
    const date = new Date('2026-07-25');
    expect(boundaryXFor(date, date)).toBe(HALF_WINDOW_DAYS);
  });

  it('shifts within the window as the selected date moves away from balanceDate', () => {
    const balanceDate = new Date('2026-07-25');
    const selected = new Date('2026-07-20');
    // Scrubbed 5 days into the past, so the boundary sits 5 days further into the window.
    expect(boundaryXFor(balanceDate, selected)).toBe(HALF_WINDOW_DAYS + 5);
  });
});
