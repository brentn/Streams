import { describe, expect, it } from 'vitest';
import { BudgetFlow, RecurringFlow } from '../models/flow';
import { Transaction } from '../models/transaction';
import { balanceAtDate, balanceSeries } from './projection-engine';

const account = { balance: 1000, balanceDate: new Date('2026-07-25T12:00:00Z') };

function txn(id: string, date: string, amount: number): Transaction {
  return { id, accountId: 'acc-1', date: new Date(date), amount, description: `txn-${id}`, matchedFlowId: null };
}

function recurringFlow(overrides: Partial<RecurringFlow> = {}): RecurringFlow {
  return {
    id: 'flow-1',
    accountId: 'acc-1',
    name: 'Paycheck',
    direction: 'in',
    kind: 'recurring',
    amount: 100,
    cadence: {
      period: 'week',
      interval: 1,
      anchors: [{ dayOfWeek: 5 }], // Friday
      anchorDate: new Date(2026, 0, 2), // a Friday; irrelevant for interval 1 anyway
    },
    ...overrides,
  };
}

function budgetFlow(overrides: Partial<BudgetFlow> = {}): BudgetFlow {
  return {
    id: 'flow-2',
    accountId: 'acc-1',
    name: 'Groceries',
    direction: 'out',
    kind: 'budget',
    limit: 310,
    period: 'month',
    ...overrides,
  };
}

describe('balanceAtDate', () => {
  it('returns the anchor balance at the balanceDate itself', () => {
    expect(balanceAtDate(account, [], account.balanceDate, [])).toBe(1000);
  });

  it('returns the anchor balance flat for any future date when there are no Flows', () => {
    const future = new Date('2026-08-25T12:00:00Z');
    expect(balanceAtDate(account, [], future, [])).toBe(1000);
  });

  it('walks a single transaction backward out of the anchor', () => {
    const transactions = [txn('t1', '2026-07-20T09:00:00Z', -50)];
    const past = new Date('2026-07-19T00:00:00Z');
    // t1 happened after `past` and on/before balanceDate, so it's undone: 1000 - (-50) = 1050
    expect(balanceAtDate(account, transactions, past, [])).toBe(1050);
  });

  it('walks multiple transactions across several days backward', () => {
    const transactions = [
      txn('t1', '2026-07-24T09:00:00Z', -50),
      txn('t2', '2026-07-22T09:00:00Z', 200),
      txn('t3', '2026-07-10T09:00:00Z', -1000),
    ];
    const past = new Date('2026-07-21T00:00:00Z');
    // Only t1 and t2 fall after `past`: 1000 - (-50) - 200 = 850
    expect(balanceAtDate(account, transactions, past, [])).toBe(850);
  });

  it('sums same-day transactions correctly', () => {
    const transactions = [
      txn('t1', '2026-07-24T08:00:00Z', -30),
      txn('t2', '2026-07-24T20:00:00Z', -70),
    ];
    const past = new Date('2026-07-23T00:00:00Z');
    expect(balanceAtDate(account, transactions, past, [])).toBe(1100);
  });

  it('ignores transactions before the requested date', () => {
    const transactions = [txn('t1', '2026-07-01T09:00:00Z', -500)];
    const past = new Date('2026-07-15T00:00:00Z');
    expect(balanceAtDate(account, transactions, past, [])).toBe(1000);
  });

  it('ignores transactions after the balanceDate', () => {
    const transactions = [txn('t1', '2026-08-01T09:00:00Z', -500)];
    const past = new Date('2026-07-01T00:00:00Z');
    expect(balanceAtDate(account, transactions, past, [])).toBe(1000);
  });

  it('returns the anchor balance flat with an empty transaction list', () => {
    const past = new Date('2020-01-01T00:00:00Z');
    expect(balanceAtDate(account, [], past, [])).toBe(1000);
  });

  it('ignores Flows entirely for a past date — only actual transactions drive history', () => {
    const past = new Date('2026-07-19T00:00:00Z');
    const flows = [recurringFlow({ amount: 99999 })];
    expect(balanceAtDate(account, [], past, flows)).toBe(1000);
  });

  it('adds a recurring-kind Flow’s expected occurrences to the forward projection', () => {
    // Fridays after 2026-07-25 (balanceDate) through 2026-08-08: 7/31 and 8/7 — two occurrences.
    const future = new Date('2026-08-08T12:00:00Z');
    const flows = [recurringFlow({ amount: 100, direction: 'in' })];
    expect(balanceAtDate(account, [], future, flows)).toBe(1000 + 100 * 2);
  });

  it('subtracts an out-direction recurring Flow from the forward projection', () => {
    const future = new Date('2026-08-01T12:00:00Z'); // one Friday (7/31) in range
    const flows = [recurringFlow({ amount: 100, direction: 'out' })];
    expect(balanceAtDate(account, [], future, flows)).toBe(1000 - 100);
  });

  it('prorates a budget-kind Flow’s limit across the projected period', () => {
    // balanceDate 2026-07-25, projecting to 2026-07-31: 6 of July's 31 days covered.
    const future = new Date('2026-07-31T12:00:00Z');
    const flows = [budgetFlow({ limit: 310, direction: 'out' })];
    expect(balanceAtDate(account, [], future, flows)).toBeCloseTo(1000 - (310 * 6) / 31);
  });

  it('combines multiple active Flows in the forward projection', () => {
    const future = new Date('2026-08-01T12:00:00Z');
    const flows = [
      recurringFlow({ amount: 100, direction: 'in' }), // one Friday (7/31)
      budgetFlow({ limit: 310, direction: 'out' }), // 6/31 of July + 1/31 of August
    ];
    const expected = 1000 + 100 * 1 - ((310 * 6) / 31 + (310 * 1) / 31);
    expect(balanceAtDate(account, [], future, flows)).toBeCloseTo(expected);
  });
});

describe('balanceSeries', () => {
  it('samples the balance at each given date', () => {
    const transactions = [txn('t1', '2026-07-24T09:00:00Z', -50)];
    const dates = [new Date('2026-07-19T00:00:00Z'), account.balanceDate];

    expect(balanceSeries(account, transactions, dates, [])).toEqual([
      { date: dates[0], balance: 1050 },
      { date: dates[1], balance: 1000 },
    ]);
  });

  it('returns an empty series for an empty date list', () => {
    expect(balanceSeries(account, [], [], [])).toEqual([]);
  });

  it('reflects a recurring Flow’s occurrences as the sampled dates move forward', () => {
    const dates = [new Date('2026-07-25T12:00:00Z'), new Date('2026-07-31T12:00:00Z')];
    const flows = [recurringFlow({ amount: 100, direction: 'in' })];

    expect(balanceSeries(account, [], dates, flows)).toEqual([
      { date: dates[0], balance: 1000 },
      { date: dates[1], balance: 1100 },
    ]);
  });
});
