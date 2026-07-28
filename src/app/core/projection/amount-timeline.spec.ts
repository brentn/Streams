import { describe, expect, it } from 'vitest';
import { RecurringRule, StepChange } from '../models/flow';
import { amountAtDate, changeDatesInRange } from './amount-timeline';

function d(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function step(effectiveDate: string, amount: number): StepChange {
  return { type: 'step', effectiveDate: d(effectiveDate), amount };
}

function rule(anniversaryDate: string, delta: number): RecurringRule {
  return { type: 'recurring-rule', anniversaryDate: d(anniversaryDate), delta };
}

describe('amountAtDate', () => {
  it('returns the initial amount when there are no changes', () => {
    expect(amountAtDate(100, [], d('2026-07-27'))).toBe(100);
  });

  it('returns the initial amount before any change takes effect', () => {
    const changes = [step('2026-08-01', 150)];
    expect(amountAtDate(100, changes, d('2026-07-31'))).toBe(100);
  });

  it('applies a Step Change on its effective date (inclusive)', () => {
    const changes = [step('2026-08-01', 150)];
    expect(amountAtDate(100, changes, d('2026-08-01'))).toBe(150);
  });

  it('applies a Step Change for every date after it, until superseded', () => {
    const changes = [step('2026-08-01', 150)];
    expect(amountAtDate(100, changes, d('2026-12-25'))).toBe(150);
  });

  it('applies multiple Step Changes in chronological order regardless of input order', () => {
    const changes = [step('2027-01-01', 200), step('2026-08-01', 150)];
    expect(amountAtDate(100, changes, d('2026-09-01'))).toBe(150);
    expect(amountAtDate(100, changes, d('2027-01-01'))).toBe(200);
  });

  it('applies a Recurring Rule delta on and after its first anniversary', () => {
    const changes = [rule('2026-10-01', 25)];
    expect(amountAtDate(100, changes, d('2026-09-30'))).toBe(100);
    expect(amountAtDate(100, changes, d('2026-10-01'))).toBe(125);
    expect(amountAtDate(100, changes, d('2026-12-01'))).toBe(125);
  });

  it('fires a Recurring Rule again on each subsequent anniversary', () => {
    const changes = [rule('2026-10-01', 25)];
    expect(amountAtDate(100, changes, d('2027-10-01'))).toBe(150);
    expect(amountAtDate(100, changes, d('2028-10-01'))).toBe(175);
  });

  it('composes a Step Change and a Recurring Rule against a single timeline, no separate base amount', () => {
    const changes = [rule('2026-10-01', 25), step('2027-03-01', 300)];
    // Before the rule fires: still the initial amount.
    expect(amountAtDate(100, changes, d('2026-08-01'))).toBe(100);
    // Rule fires: 100 + 25 = 125.
    expect(amountAtDate(100, changes, d('2026-10-01'))).toBe(125);
    // Step Change overrides whatever the amount currently is.
    expect(amountAtDate(100, changes, d('2027-03-01'))).toBe(300);
    // Rule fires again on top of the Step Change's value: 300 + 25 = 325.
    expect(amountAtDate(100, changes, d('2027-10-01'))).toBe(325);
  });
});

describe('changeDatesInRange', () => {
  it('returns an empty array when there are no changes', () => {
    expect(changeDatesInRange([], d('2026-07-01'), d('2026-08-01'))).toEqual([]);
  });

  it('excludes a Step Change on or before the range start', () => {
    const changes = [step('2026-07-01', 150)];
    expect(changeDatesInRange(changes, d('2026-07-01'), d('2026-08-01'))).toEqual([]);
  });

  it('excludes a Step Change on or after the range end', () => {
    const changes = [step('2026-08-01', 150)];
    expect(changeDatesInRange(changes, d('2026-07-01'), d('2026-08-01'))).toEqual([]);
  });

  it('includes a Step Change strictly inside the range', () => {
    const changes = [step('2026-07-15', 150)];
    expect(changeDatesInRange(changes, d('2026-07-01'), d('2026-08-01'))).toEqual([d('2026-07-15')]);
  });

  it('includes every Recurring Rule firing strictly inside the range', () => {
    const changes = [rule('2026-01-15', 10)];
    expect(changeDatesInRange(changes, d('2026-01-01'), d('2028-01-01'))).toEqual([
      d('2026-01-15'),
      d('2027-01-15'),
    ]);
  });

  it('sorts and dedupes across multiple changes landing on the same date', () => {
    const changes = [step('2026-07-20', 200), rule('2026-01-05', 10), step('2026-07-10', 150)];
    expect(changeDatesInRange(changes, d('2026-07-01'), d('2026-08-01'))).toEqual([
      d('2026-07-10'),
      d('2026-07-20'),
    ]);
  });
});
