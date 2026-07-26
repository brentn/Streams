import { describe, expect, it } from 'vitest';
import { budgetContribution } from './budget-period';

function d(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

describe('budgetContribution', () => {
  it('returns 0 for an empty or inverted range', () => {
    expect(budgetContribution('month', 500, d('2026-07-01'), d('2026-07-01'))).toBe(0);
    expect(budgetContribution('month', 500, d('2026-07-10'), d('2026-07-01'))).toBe(0);
  });

  it('returns the full limit for a range covering exactly one whole month', () => {
    expect(budgetContribution('month', 500, d('2026-06-30'), d('2026-07-31'))).toBe(500);
  });

  it('prorates a partial month by the fraction of days covered', () => {
    // July has 31 days; days 16-31 (16 days) are covered.
    expect(budgetContribution('month', 500, d('2026-07-15'), d('2026-07-31'))).toBeCloseTo(
      (500 * 16) / 31,
    );
  });

  it('resets cleanly at the month boundary — no rollover of an unspent partial period', () => {
    // Jul 16 - Aug 15: 16 days left in July (31-day month) + 15 days into August (31-day month).
    expect(budgetContribution('month', 500, d('2026-07-15'), d('2026-08-15'))).toBeCloseTo(500);
  });

  it('handles a shorter month correctly (February, non-leap)', () => {
    expect(budgetContribution('month', 280, d('2026-01-31'), d('2026-02-28'))).toBe(280);
  });

  it('returns the full limit for a range covering exactly one whole year', () => {
    expect(budgetContribution('year', 1200, d('2025-12-31'), d('2026-12-31'))).toBe(1200);
  });

  it('prorates a partial year by the fraction of days covered', () => {
    // 2026 is not a leap year: 365 days. Range covers the last 31 days of the year.
    expect(budgetContribution('year', 3650, d('2026-11-30'), d('2026-12-31'))).toBeCloseTo(
      (3650 * 31) / 365,
    );
  });

  it('spans multiple full years', () => {
    expect(budgetContribution('year', 1200, d('2024-12-31'), d('2026-12-31'))).toBe(2400);
  });
});
