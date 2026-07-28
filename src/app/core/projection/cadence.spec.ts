import { describe, expect, it } from 'vitest';
import { Cadence } from '../models/flow';
import { lastCompletedPeriod, occurrencesInRange } from './cadence';

// Local-midnight parse (not `new Date(iso)`, which treats a date-only string as UTC and
// would drift from cadence.ts's local-time `new Date(year, month, day)` construction).
function d(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

describe('occurrencesInRange', () => {
  it('returns an empty list when the range is empty or inverted', () => {
    const cadence: Cadence = {
      period: 'week',
      interval: 1,
      anchors: [{ dayOfWeek: 5 }],
      anchorDate: d('2026-01-02'),
    };
    expect(occurrencesInRange(cadence, d('2026-07-01'), d('2026-07-01'))).toEqual([]);
    expect(occurrencesInRange(cadence, d('2026-07-05'), d('2026-07-01'))).toEqual([]);
  });

  it('excludes the range start and includes the range end', () => {
    // Friday weekly cadence; 2026-07-03 and 2026-07-10 are both Fridays.
    const cadence: Cadence = {
      period: 'week',
      interval: 1,
      anchors: [{ dayOfWeek: 5 }],
      anchorDate: d('2026-01-02'),
    };
    expect(occurrencesInRange(cadence, d('2026-07-03'), d('2026-07-10'))).toEqual([d('2026-07-10')]);
  });

  describe('weekly (period: week)', () => {
    it('finds one occurrence per week for a single day-of-week anchor', () => {
      const cadence: Cadence = {
        period: 'week',
        interval: 1,
        anchors: [{ dayOfWeek: 5 }], // Friday
        anchorDate: d('2026-01-02'),
      };
      const result = occurrencesInRange(cadence, d('2026-06-30'), d('2026-07-21'));
      expect(result).toEqual([d('2026-07-03'), d('2026-07-10'), d('2026-07-17')]);
    });

    it('honors a biweekly interval relative to the anchor date', () => {
      // Anchor is Friday 2026-07-03, so biweekly Fridays land on 7/3, 7/17, 7/31 — not 7/10 or 7/24.
      const cadence: Cadence = {
        period: 'week',
        interval: 2,
        anchors: [{ dayOfWeek: 5 }],
        anchorDate: d('2026-07-03'),
      };
      const result = occurrencesInRange(cadence, d('2026-06-30'), d('2026-08-01'));
      expect(result).toEqual([d('2026-07-03'), d('2026-07-17'), d('2026-07-31')]);
    });
  });

  describe('monthly (period: month)', () => {
    it('finds one occurrence per month for a day-of-month anchor', () => {
      const cadence: Cadence = {
        period: 'month',
        interval: 1,
        anchors: [{ day: 15 }],
        anchorDate: d('2026-01-15'),
      };
      const result = occurrencesInRange(cadence, d('2026-06-30'), d('2026-09-01'));
      expect(result).toEqual([d('2026-07-15'), d('2026-08-15')]);
    });

    it('clamps a day-of-month anchor to the last day of shorter months', () => {
      const cadence: Cadence = {
        period: 'month',
        interval: 1,
        anchors: [{ day: 31 }],
        anchorDate: d('2026-01-31'),
      };
      const result = occurrencesInRange(cadence, d('2026-01-31'), d('2026-04-01'));
      // Feb 2027 isn't a leap year concern here since 2026 isn't relevant; Feb 2026 has 28 days.
      expect(result).toEqual([d('2026-02-28'), d('2026-03-31')]);
    });

    it('supports semi-monthly via two day-of-month anchors', () => {
      const cadence: Cadence = {
        period: 'month',
        interval: 1,
        anchors: [{ day: 1 }, { day: 15 }],
        anchorDate: d('2026-01-01'),
      };
      const result = occurrencesInRange(cadence, d('2026-06-30'), d('2026-07-31'));
      expect(result).toEqual([d('2026-07-01'), d('2026-07-15')]);
    });

    it('honors a bi-monthly interval relative to the anchor date', () => {
      const cadence: Cadence = {
        period: 'month',
        interval: 2,
        anchors: [{ day: 1 }],
        anchorDate: d('2026-01-01'),
      };
      const result = occurrencesInRange(cadence, d('2026-01-01'), d('2026-07-01'));
      expect(result).toEqual([d('2026-03-01'), d('2026-05-01'), d('2026-07-01')]);
    });

    it('resolves an nth-weekday-of-month anchor', () => {
      // Second Tuesday of July 2026 is the 14th.
      const cadence: Cadence = {
        period: 'month',
        interval: 1,
        anchors: [{ nth: 2, dayOfWeek: 2 }],
        anchorDate: d('2026-01-01'),
      };
      const result = occurrencesInRange(cadence, d('2026-06-30'), d('2026-07-31'));
      expect(result).toEqual([d('2026-07-14')]);
    });

    it('resolves a "last weekday" anchor to the final occurrence of that weekday in the month', () => {
      // Last Wednesday of July 2026 is the 29th.
      const cadence: Cadence = {
        period: 'month',
        interval: 1,
        anchors: [{ nth: -1, dayOfWeek: 3 }],
        anchorDate: d('2026-01-01'),
      };
      const result = occurrencesInRange(cadence, d('2026-06-30'), d('2026-07-31'));
      expect(result).toEqual([d('2026-07-29')]);
    });
  });

  describe('yearly (period: year)', () => {
    it('finds one occurrence per year for a month+day anchor', () => {
      const cadence: Cadence = {
        period: 'year',
        interval: 1,
        anchors: [{ month: 10, day: 1 }],
        anchorDate: d('2025-10-01'),
      };
      const result = occurrencesInRange(cadence, d('2026-01-01'), d('2027-12-31'));
      expect(result).toEqual([d('2026-10-01'), d('2027-10-01')]);
    });

    it('supports semi-annual via two month+day anchors', () => {
      const cadence: Cadence = {
        period: 'year',
        interval: 1,
        anchors: [
          { month: 1, day: 1 },
          { month: 7, day: 1 },
        ],
        anchorDate: d('2026-01-01'),
      };
      const result = occurrencesInRange(cadence, d('2025-12-31'), d('2026-12-31'));
      expect(result).toEqual([d('2026-01-01'), d('2026-07-01')]);
    });
  });
});

describe('lastCompletedPeriod', () => {
  const weeklyCadence: Cadence = {
    period: 'week',
    interval: 1,
    anchors: [{ dayOfWeek: 5 }], // Friday
    anchorDate: d('2026-01-02'),
  };

  it('returns null when only one occurrence is findable within the search floor', () => {
    // Cadence math is unbounded backward (no Flow "creation date" concept), so this only
    // exercises lastCompletedPeriod's own epoch-bounded search floor, not a real "new Flow"
    // scenario. 1970-01-02 is the first Friday on/after the Unix epoch.
    expect(lastCompletedPeriod(weeklyCadence, d('1970-01-02'))).toBeNull();
  });

  it('returns the window between the last two occurrences on or before asOf', () => {
    // Fridays: ...2026-07-03, 2026-07-10, 2026-07-17. asOf is between the last two.
    expect(lastCompletedPeriod(weeklyCadence, d('2026-07-15'))).toEqual({
      startExclusive: d('2026-07-03'),
      endInclusive: d('2026-07-10'),
    });
  });

  it('treats asOf landing exactly on an occurrence as that occurrence having happened', () => {
    expect(lastCompletedPeriod(weeklyCadence, d('2026-07-10'))).toEqual({
      startExclusive: d('2026-07-03'),
      endInclusive: d('2026-07-10'),
    });
  });

  it('advances the window as asOf moves past a later occurrence', () => {
    expect(lastCompletedPeriod(weeklyCadence, d('2026-07-17'))).toEqual({
      startExclusive: d('2026-07-10'),
      endInclusive: d('2026-07-17'),
    });
  });
});
