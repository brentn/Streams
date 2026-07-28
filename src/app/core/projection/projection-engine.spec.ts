import { describe, expect, it } from 'vitest';
import { BudgetFlow, Cadence, RecurringFlow } from '../models/flow';
import { Transaction } from '../models/transaction';
import { Transfer } from '../models/transfer';
import {
  balanceAtDate,
  balanceSeries,
  PROJECTION_HORIZON_DAYS,
  runningDryAlert,
  varianceAlert,
} from './projection-engine';

const account = { id: 'acc-1', balance: 1000, balanceDate: new Date('2026-07-25T12:00:00Z') };
const otherAccount = { id: 'acc-2', balance: 500, balanceDate: new Date('2026-07-25T12:00:00Z') };

const weeklyCadence: Cadence = {
  period: 'week',
  interval: 1,
  anchors: [{ dayOfWeek: 5 }], // Friday
  anchorDate: new Date(2026, 0, 2),
};

function transfer(overrides: Partial<Transfer> = {}): Transfer {
  return {
    id: 'transfer-1',
    fromAccountId: 'acc-1',
    toAccountId: 'acc-2',
    amount: 100,
    cadence: weeklyCadence,
    ...overrides,
  };
}

function txn(id: string, date: string, amount: number): Transaction {
  return {
    id,
    accountId: 'acc-1',
    date: new Date(date),
    amount,
    description: `txn-${id}`,
    matchedFlowId: null,
  };
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

  it('applies a Step Change to a recurring Flow’s occurrences from its effective date forward', () => {
    // Fridays after 2026-07-25 through 2026-08-08: 7/31 (still 100) and 8/7 (Step Change to 150).
    const future = new Date('2026-08-08T12:00:00Z');
    const flows = [
      recurringFlow({
        amount: 100,
        direction: 'in',
        amountChanges: [{ type: 'step', effectiveDate: new Date(2026, 7, 1), amount: 150 }],
      }),
    ];
    expect(balanceAtDate(account, [], future, flows)).toBe(1000 + 100 + 150);
  });

  it('applies a Recurring Rule to a recurring Flow’s occurrences from its anniversary forward', () => {
    const future = new Date('2026-08-08T12:00:00Z');
    const flows = [
      recurringFlow({
        amount: 100,
        direction: 'in',
        amountChanges: [
          { type: 'recurring-rule', anniversaryDate: new Date(2026, 7, 1), delta: 10 },
        ],
      }),
    ];
    expect(balanceAtDate(account, [], future, flows)).toBe(1000 + 100 + 110);
  });

  it('applies a Step Change to a budget-kind Flow’s limit, prorating each sub-slice against it', () => {
    // balanceDate 2026-07-25, projecting to 2026-07-31: days 26-30 at 310, day 31 at 620.
    const future = new Date('2026-07-31T12:00:00Z');
    const flows = [
      budgetFlow({
        limit: 310,
        direction: 'out',
        amountChanges: [{ type: 'step', effectiveDate: new Date(2026, 6, 31), amount: 620 }],
      }),
    ];
    const expected = 1000 - ((310 * 5) / 31 + (620 * 1) / 31);
    expect(balanceAtDate(account, [], future, flows)).toBeCloseTo(expected);
  });
});

describe('balanceAtDate with Transfers', () => {
  it('subtracts a Transfer’s occurrences from the from-Account’s forward projection', () => {
    // Fridays after 2026-07-25 through 2026-08-08: 7/31 and 8/7 — two occurrences.
    const future = new Date('2026-08-08T12:00:00Z');
    const transfers = [transfer({ amount: 100 })];
    expect(balanceAtDate(account, [], future, [], transfers)).toBe(1000 - 100 * 2);
  });

  it('adds a Transfer’s occurrences to the to-Account’s forward projection', () => {
    const future = new Date('2026-08-08T12:00:00Z');
    const transfers = [transfer({ amount: 100 })];
    expect(balanceAtDate(otherAccount, [], future, [], transfers)).toBe(500 + 100 * 2);
  });

  it('applies symmetrically: the from- and to-Account sides move by the same magnitude in opposite directions', () => {
    const future = new Date('2026-08-08T12:00:00Z');
    const transfers = [transfer({ amount: 100 })];
    const fromDelta = balanceAtDate(account, [], future, [], transfers) - account.balance;
    const toDelta = balanceAtDate(otherAccount, [], future, [], transfers) - otherAccount.balance;
    expect(fromDelta).toBe(-toDelta);
  });

  it('ignores a Transfer that touches neither Account', () => {
    const future = new Date('2026-08-08T12:00:00Z');
    const unrelated = { id: 'acc-3', balance: 50, balanceDate: account.balanceDate };
    const transfers = [transfer()];
    expect(balanceAtDate(unrelated, [], future, [], transfers)).toBe(50);
  });

  it('ignores Transfers entirely for a past date — only actual transactions drive history', () => {
    const past = new Date('2026-07-19T00:00:00Z');
    const transfers = [transfer({ amount: 99999 })];
    expect(balanceAtDate(account, [], past, [], transfers)).toBe(1000);
  });

  it('combines a Transfer with the Account’s other Flows', () => {
    const future = new Date('2026-08-01T12:00:00Z'); // one Friday (7/31) in range
    const flows = [recurringFlow({ amount: 50, direction: 'in' })];
    const transfers = [transfer({ amount: 100 })];
    expect(balanceAtDate(account, [], future, flows, transfers)).toBe(1000 + 50 - 100);
  });

  it('applies a Step Change to a Transfer’s occurrences from its effective date forward', () => {
    // Fridays after 2026-07-25 through 2026-08-08: 7/31 (still 100) and 8/7 (Step Change to 150).
    const future = new Date('2026-08-08T12:00:00Z');
    const transfers = [
      transfer({
        amount: 100,
        amountChanges: [{ type: 'step', effectiveDate: new Date(2026, 7, 1), amount: 150 }],
      }),
    ];
    expect(balanceAtDate(account, [], future, [], transfers)).toBe(1000 - (100 + 150));
  });

  it('defaults to no Transfers when the parameter is omitted', () => {
    const future = new Date('2026-08-08T12:00:00Z');
    expect(balanceAtDate(account, [], future, [])).toBe(1000);
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

  it('reflects a Transfer’s occurrences as the sampled dates move forward', () => {
    const dates = [new Date('2026-07-25T12:00:00Z'), new Date('2026-07-31T12:00:00Z')];
    const transfers = [transfer({ amount: 100 })];

    expect(balanceSeries(account, [], dates, [], transfers)).toEqual([
      { date: dates[0], balance: 1000 },
      { date: dates[1], balance: 900 },
    ]);
  });
});

describe('runningDryAlert', () => {
  const today = new Date('2026-07-25T12:00:00Z'); // same instant as account.balanceDate

  it('defaults the Projection Horizon to 90 days', () => {
    expect(PROJECTION_HORIZON_DAYS).toBe(90);
  });

  it('returns null when the projected balance never crosses the Dry Floor within the horizon', () => {
    const dryAccount = { ...account, dryFloor: 0 };
    expect(runningDryAlert(dryAccount, [], [], [], today)).toBeNull();
  });

  it('returns the first date and balance at which the projection crosses below the Dry Floor', () => {
    // Weekly out-direction Flow: balance holds at 1000 through 7/30, drops to 900 on the
    // first Friday occurrence (7/31) — the first point under a 950 Dry Floor.
    const dryAccount = { ...account, dryFloor: 950 };
    const flows = [recurringFlow({ amount: 100, direction: 'out' })];

    expect(runningDryAlert(dryAccount, [], flows, [], today)).toEqual({
      date: new Date('2026-07-31T12:00:00Z'),
      balance: 900,
    });
  });

  it('does not report a crossing that falls beyond the given horizon', () => {
    // Same scenario as above, but the crossing (7/31, 6 days out) falls outside a 5-day horizon.
    const dryAccount = { ...account, dryFloor: 950 };
    const flows = [recurringFlow({ amount: 100, direction: 'out' })];

    expect(runningDryAlert(dryAccount, [], flows, [], today, 5)).toBeNull();
  });

  it('reports today itself when the balance is already at or below the Dry Floor at the start of the horizon', () => {
    const dryAccount = { ...account, dryFloor: 1500 };
    expect(runningDryAlert(dryAccount, [], [], [], today)).toEqual({ date: today, balance: 1000 });
  });

  it('reflects a Transfer’s occurrences alongside the Account’s Flows', () => {
    const dryAccount = { ...account, dryFloor: 950 };
    const transfers = [transfer({ amount: 100 })]; // from-Account: acc-1, same weekly Friday cadence

    expect(runningDryAlert(dryAccount, [], [], transfers, today)).toEqual({
      date: new Date('2026-07-31T12:00:00Z'),
      balance: 900,
    });
  });
});

function matchedTxn(id: string, date: string, amount: number, flowId: string): Transaction {
  return { ...txn(id, date, amount), matchedFlowId: flowId };
}

describe('varianceAlert', () => {
  // Fridays in range: 2026-07-03, 07-10, 07-17 — the last completed period as of `today`
  // is (07-03, 07-10]. The prior completed calendar month is June (05-31, 06-30].
  const today = new Date('2026-07-15T12:00:00Z');

  it('returns null when the Flow has no Tolerance set', () => {
    const flow = recurringFlow({ amount: 100, direction: 'in' });
    const transactions = [matchedTxn('t1', '2026-07-08T09:00:00Z', 130, flow.id)];
    expect(varianceAlert(flow, transactions, today)).toBeNull();
  });

  it('returns null when no completed period has happened yet', () => {
    const flow = recurringFlow({
      amount: 100,
      direction: 'in',
      tolerance: { kind: 'fixed', value: 10 },
    });
    // Only one occurrence findable this close to the epoch — see cadence.spec.ts.
    expect(varianceAlert(flow, [], new Date('1970-01-02T12:00:00Z'))).toBeNull();
  });

  describe('recurring-kind Flow (symmetric)', () => {
    it('returns null when the actual total is within Tolerance', () => {
      const flow = recurringFlow({
        amount: 100,
        direction: 'in',
        tolerance: { kind: 'fixed', value: 10 },
      });
      const transactions = [matchedTxn('t1', '2026-07-08T09:00:00Z', 105, flow.id)];
      expect(varianceAlert(flow, transactions, today)).toBeNull();
    });

    it('alerts when the actual total is too high', () => {
      const flow = recurringFlow({
        amount: 100,
        direction: 'in',
        tolerance: { kind: 'fixed', value: 10 },
      });
      const transactions = [matchedTxn('t1', '2026-07-08T09:00:00Z', 130, flow.id)];
      expect(varianceAlert(flow, transactions, today)).toEqual({
        flowId: 'flow-1',
        periodStart: new Date(2026, 6, 3),
        periodEnd: new Date(2026, 6, 10),
        expected: 100,
        actual: 130,
      });
    });

    it('alerts when the actual total is too low — same Tolerance, either direction', () => {
      const flow = recurringFlow({
        amount: 100,
        direction: 'in',
        tolerance: { kind: 'fixed', value: 10 },
      });
      const transactions = [matchedTxn('t1', '2026-07-08T09:00:00Z', 60, flow.id)];
      expect(varianceAlert(flow, transactions, today)).toEqual({
        flowId: 'flow-1',
        periodStart: new Date(2026, 6, 3),
        periodEnd: new Date(2026, 6, 10),
        expected: 100,
        actual: 60,
      });
    });

    it('supports a percentage Tolerance', () => {
      const flow = recurringFlow({
        amount: 100,
        direction: 'out',
        tolerance: { kind: 'percent', value: 10 },
      });
      const within = [matchedTxn('t1', '2026-07-08T09:00:00Z', -95, flow.id)];
      expect(varianceAlert(flow, within, today)).toBeNull();

      const outside = [matchedTxn('t2', '2026-07-08T09:00:00Z', -140, flow.id)];
      expect(varianceAlert(flow, outside, today)?.actual).toBe(140);
    });

    it('ignores Transactions matched to a different Flow', () => {
      const flow = recurringFlow({
        amount: 100,
        direction: 'in',
        tolerance: { kind: 'fixed', value: 10 },
      });
      const transactions = [
        matchedTxn('t1', '2026-07-08T09:00:00Z', 100, flow.id),
        matchedTxn('t2', '2026-07-08T09:00:00Z', 5000, 'other-flow'),
      ];
      expect(varianceAlert(flow, transactions, today)).toBeNull();
    });
  });

  describe('budget-kind Flow (single-directional, mirroring direction)', () => {
    it('alerts an expense budget only when actual spend exceeds the limit beyond Tolerance', () => {
      const flow = budgetFlow({
        limit: 310,
        direction: 'out',
        tolerance: { kind: 'fixed', value: 50 },
      });

      const overspent = [matchedTxn('t1', '2026-06-15T09:00:00Z', -400, flow.id)];
      expect(varianceAlert(flow, overspent, today)).toEqual({
        flowId: 'flow-2',
        periodStart: new Date(2026, 4, 31),
        periodEnd: new Date(2026, 5, 30),
        expected: 310,
        actual: 400,
      });

      const underspent = [matchedTxn('t2', '2026-06-15T09:00:00Z', -100, flow.id)];
      expect(varianceAlert(flow, underspent, today)).toBeNull();
    });

    it('alerts an income budget only when actual income falls short of the target beyond Tolerance', () => {
      const flow = budgetFlow({
        limit: 2000,
        direction: 'in',
        tolerance: { kind: 'fixed', value: 100 },
      });

      const shortfall = [matchedTxn('t1', '2026-06-15T09:00:00Z', 1500, flow.id)];
      expect(varianceAlert(flow, shortfall, today)).toEqual({
        flowId: 'flow-2',
        periodStart: new Date(2026, 4, 31),
        periodEnd: new Date(2026, 5, 30),
        expected: 2000,
        actual: 1500,
      });

      const surplus = [matchedTxn('t2', '2026-06-15T09:00:00Z', 2500, flow.id)];
      expect(varianceAlert(flow, surplus, today)).toBeNull();
    });
  });
});
