import { describe, expect, it } from 'vitest';
import { BudgetFlow, Cadence, RecurringFlow, Tolerance } from '../models/flow';
import { Transaction } from '../models/transaction';
import { Transfer } from '../models/transfer';
import {
  balanceAtDate,
  balanceSeries,
  budgetProgress,
  budgetProgressStatus,
  outstandingAlert,
  PROJECTION_HORIZON_DAYS,
  runningDryAlert,
  totalBalanceSeries,
  varianceAlert,
  withOutstandingOccurrences,
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
    matchedTarget: null,
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

describe("totalBalanceSeries (#79 — the Total lane's own domain, summed across accounts per date)", () => {
  it("sums every account's balance at each date", () => {
    const dates = [new Date('2026-07-19T00:00:00Z'), account.balanceDate];
    const transactionsByAccount = new Map([
      [account.id, []],
      [otherAccount.id, []],
    ]);
    const flowsByAccount = new Map([
      [account.id, []],
      [otherAccount.id, []],
    ]);

    const totals = totalBalanceSeries(
      [account, otherAccount],
      transactionsByAccount,
      dates,
      flowsByAccount,
    );

    expect(totals).toEqual([1500, 1500]);
  });

  it('returns an empty series for no dates, and zeroes for no accounts', () => {
    expect(totalBalanceSeries([account], new Map(), [], new Map())).toEqual([]);
    expect(totalBalanceSeries([], new Map(), [new Date()], new Map())).toEqual([0]);
  });

  it('falls back to an empty list for an account missing from a by-account map', () => {
    const dates = [account.balanceDate];

    const totals = totalBalanceSeries([account, otherAccount], new Map(), dates, new Map());

    expect(totals).toEqual([1500]);
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
  return { ...txn(id, date, amount), matchedTarget: { kind: 'flow', id: flowId } };
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

describe('budgetProgress', () => {
  const today = new Date('2026-07-15T12:00:00Z');

  it('reports zero used against the full limit when nothing has been spent this period', () => {
    const flow = budgetFlow({ limit: 400, direction: 'out' });
    expect(budgetProgress(flow, [], today)).toEqual({ used: 0, limit: 400 });
  });

  it('sums matched Transactions within the in-progress period as a positive magnitude', () => {
    const flow = budgetFlow({ limit: 400, direction: 'out' });
    const transactions = [
      matchedTxn('t1', '2026-07-03T09:00:00Z', -30, flow.id),
      matchedTxn('t2', '2026-07-10T09:00:00Z', -70, flow.id),
    ];
    expect(budgetProgress(flow, transactions, today)).toEqual({ used: 100, limit: 400 });
  });

  it('excludes Transactions from before the current period started', () => {
    const flow = budgetFlow({ limit: 400, direction: 'out' });
    const transactions = [matchedTxn('t1', '2026-06-25T09:00:00Z', -300, flow.id)];
    expect(budgetProgress(flow, transactions, today)).toEqual({ used: 0, limit: 400 });
  });

  it('excludes Transactions matched to a different Flow', () => {
    const flow = budgetFlow({ limit: 400, direction: 'out' });
    const transactions = [matchedTxn('t1', '2026-07-03T09:00:00Z', -300, 'other-flow')];
    expect(budgetProgress(flow, transactions, today)).toEqual({ used: 0, limit: 400 });
  });

  it('clamps used to zero rather than going negative when actuals land opposite the expense direction', () => {
    const flow = budgetFlow({ limit: 400, direction: 'out' });
    const transactions = [matchedTxn('t1', '2026-07-03T09:00:00Z', 50, flow.id)]; // a refund
    expect(budgetProgress(flow, transactions, today)).toEqual({ used: 0, limit: 400 });
  });

  it("reflects a Step Change in effect as of today's limit", () => {
    const flow = budgetFlow({
      limit: 400,
      direction: 'out',
      amountChanges: [{ type: 'step', effectiveDate: new Date(2026, 6, 10), amount: 500 }],
    });
    expect(budgetProgress(flow, [], today)).toEqual({ used: 0, limit: 500 });
  });
});

describe('outstandingAlert (ADR-0012)', () => {
  // weeklyCadence-shaped recurringFlow's Friday series: ...07-17, 07-24, 07-31, 08-07...

  it('returns null when balanceDate has not yet caught up to the most recent occurrence', () => {
    const flow = recurringFlow({ amount: 100, direction: 'out' });
    const today = new Date('2026-08-01T12:00:00Z'); // most recent occurrence at/before today is 07-31
    const notYetSynced = { ...account, balanceDate: new Date('2026-07-25T12:00:00Z') };
    expect(outstandingAlert(flow, [], notYetSynced, today)).toBeNull();
  });

  it('flags the most recent occurrence as Outstanding once balanceDate has passed it with no match', () => {
    const flow = recurringFlow({ amount: 100, direction: 'out' });
    const today = new Date('2026-08-01T12:00:00Z');
    const synced = { ...account, balanceDate: new Date('2026-08-01T12:00:00Z') };
    expect(outstandingAlert(flow, [], synced, today)).toEqual({
      flowId: 'flow-1',
      occurrenceDate: new Date(2026, 6, 31),
      amount: 100,
    });
  });

  it('returns null once a Transaction matches the Flow after the previous occurrence', () => {
    const flow = recurringFlow({ amount: 100, direction: 'out' });
    const today = new Date('2026-08-01T12:00:00Z');
    const synced = { ...account, balanceDate: new Date('2026-08-01T12:00:00Z') };
    const transactions = [matchedTxn('t1', '2026-07-31T09:00:00Z', -100, flow.id)];
    expect(outstandingAlert(flow, transactions, synced, today)).toBeNull();
  });

  it('ignores a Transaction matched to a different Flow', () => {
    const flow = recurringFlow({ amount: 100, direction: 'out' });
    const today = new Date('2026-08-01T12:00:00Z');
    const synced = { ...account, balanceDate: new Date('2026-08-01T12:00:00Z') };
    const transactions = [matchedTxn('t1', '2026-07-31T09:00:00Z', -100, 'other-flow')];
    expect(outstandingAlert(flow, transactions, synced, today)).not.toBeNull();
  });

  it('ignores a Transaction that only fulfilled an earlier occurrence, not the most recent one', () => {
    const flow = recurringFlow({ amount: 100, direction: 'out' });
    const today = new Date('2026-08-01T12:00:00Z');
    const synced = { ...account, balanceDate: new Date('2026-08-01T12:00:00Z') };
    const transactions = [matchedTxn('t1', '2026-07-17T09:00:00Z', -100, flow.id)];
    expect(outstandingAlert(flow, transactions, synced, today)).not.toBeNull();
  });

  it('returns null for a budget-kind Flow — no occurrence timeline to go Outstanding', () => {
    const today = new Date('2026-08-01T12:00:00Z');
    const synced = { ...account, balanceDate: new Date('2026-08-01T12:00:00Z') };
    expect(outstandingAlert(budgetFlow(), [], synced, today)).toBeNull();
  });

  it('returns null when no occurrence has happened yet', () => {
    const flow = recurringFlow({ cadence: { period: 'once', date: new Date(2030, 0, 1) } });
    const today = new Date('2026-08-01T12:00:00Z');
    expect(outstandingAlert(flow, [], account, today)).toBeNull();
  });

  it('evaluates a one-time Cadence Flow the same way as a recurring one', () => {
    const flow = recurringFlow({
      amount: 250,
      direction: 'out',
      cadence: { period: 'once', date: new Date(2026, 6, 20) },
    });
    const today = new Date('2026-07-25T12:00:00Z');
    const synced = { ...account, balanceDate: new Date('2026-07-25T12:00:00Z') };
    expect(outstandingAlert(flow, [], synced, today)).toEqual({
      flowId: 'flow-1',
      occurrenceDate: new Date(2026, 6, 20),
      amount: 250,
    });
  });

  it("sizes the amount using amountChanges in effect at the occurrence date, not today's", () => {
    const flow = recurringFlow({
      amount: 100,
      direction: 'out',
      amountChanges: [{ type: 'step', effectiveDate: new Date(2026, 6, 28), amount: 150 }],
    });
    const today = new Date('2026-08-01T12:00:00Z');
    const synced = { ...account, balanceDate: new Date('2026-08-01T12:00:00Z') };
    expect(outstandingAlert(flow, [], synced, today)?.amount).toBe(150);
  });

  it('still alerts when the occurrence is exactly 14 days overdue', () => {
    const flow = recurringFlow({
      amount: 100,
      direction: 'out',
      cadence: { period: 'once', date: new Date(2026, 6, 1) },
    });
    const today = new Date(2026, 6, 15); // 14 days after the 07-01 occurrence
    const synced = { ...account, balanceDate: today };
    expect(outstandingAlert(flow, [], synced, today)).not.toBeNull();
  });

  it('stops alerting once the occurrence is more than 14 days overdue', () => {
    const flow = recurringFlow({
      amount: 100,
      direction: 'out',
      cadence: { period: 'once', date: new Date(2026, 6, 1) },
    });
    const today = new Date(2026, 6, 16); // 15 days after the 07-01 occurrence
    const synced = { ...account, balanceDate: today };
    expect(outstandingAlert(flow, [], synced, today)).toBeNull();
  });

  describe('skippedOccurrences (ADR-0014)', () => {
    it('returns null for an occurrence matching a skipped (flowId, occurrenceDate) pair', () => {
      const flow = recurringFlow({ amount: 100, direction: 'out' });
      const today = new Date('2026-08-01T12:00:00Z');
      const synced = { ...account, balanceDate: new Date('2026-08-01T12:00:00Z') };
      const skipped = [{ flowId: flow.id, occurrenceDate: new Date(2026, 6, 31) }];
      expect(outstandingAlert(flow, [], synced, today, skipped)).toBeNull();
    });

    it('ignores a skip recorded against a different Flow', () => {
      const flow = recurringFlow({ amount: 100, direction: 'out' });
      const today = new Date('2026-08-01T12:00:00Z');
      const synced = { ...account, balanceDate: new Date('2026-08-01T12:00:00Z') };
      const skipped = [{ flowId: 'other-flow', occurrenceDate: new Date(2026, 6, 31) }];
      expect(outstandingAlert(flow, [], synced, today, skipped)).not.toBeNull();
    });

    it("ignores a skip recorded against a different occurrence date on the same Flow — it's scoped to the exact date", () => {
      const flow = recurringFlow({ amount: 100, direction: 'out' });
      const today = new Date('2026-08-01T12:00:00Z');
      const synced = { ...account, balanceDate: new Date('2026-08-01T12:00:00Z') };
      // A prior, earlier occurrence of the same Flow was skipped — the most recent one (07-31) wasn't.
      const skipped = [{ flowId: flow.id, occurrenceDate: new Date(2026, 6, 24) }];
      expect(outstandingAlert(flow, [], synced, today, skipped)).not.toBeNull();
    });
  });
});

describe('withOutstandingOccurrences (ADR-0012)', () => {
  it('returns the original array unchanged when no Flow is Outstanding', () => {
    const flow = recurringFlow({ amount: 100, direction: 'out' });
    const today = new Date('2026-08-01T12:00:00Z');
    const synced = { ...account, balanceDate: new Date('2026-08-01T12:00:00Z') };
    const transactions = [matchedTxn('t1', '2026-07-31T09:00:00Z', -100, flow.id)];
    expect(withOutstandingOccurrences([flow], transactions, synced, today)).toEqual([flow]);
  });

  it('appends a synthetic one-time occurrence, dated today, for an Outstanding Flow', () => {
    const flow = recurringFlow({ amount: 100, direction: 'out' });
    const today = new Date('2026-08-01T12:00:00Z');
    const synced = { ...account, balanceDate: new Date('2026-08-01T12:00:00Z') };
    const result = withOutstandingOccurrences([flow], [], synced, today);

    expect(result).toHaveLength(2);
    expect(result[0]).toBe(flow);
    expect(result[1]).toMatchObject({
      accountId: flow.accountId,
      direction: 'out',
      kind: 'recurring',
      amount: 100,
      cadence: { period: 'once', date: today },
    });
    expect(result[1].id).not.toBe(flow.id);
  });

  it('leaves a budget-kind Flow untouched — no occurrence to synthesize', () => {
    const flow = budgetFlow();
    const today = new Date('2026-08-01T12:00:00Z');
    const synced = { ...account, balanceDate: new Date('2026-08-01T12:00:00Z') };
    expect(withOutstandingOccurrences([flow], [], synced, today)).toEqual([flow]);
  });

  it('feeds the missing amount back into the forward balance projection — the accuracy gap ADR-0012 closes', () => {
    const flow = recurringFlow({ amount: 100, direction: 'out' });
    const today = new Date('2026-08-01T15:00:00Z');
    const synced = { ...account, balance: 1000, balanceDate: new Date('2026-08-01T08:00:00Z') };
    const effectiveFlows = withOutstandingOccurrences([flow], [], synced, today);

    expect(balanceAtDate(synced, [], today, [flow])).toBe(1000); // the bug: the missed occurrence just vanishes
    expect(balanceAtDate(synced, [], today, effectiveFlows)).toBe(900); // restored via the synthetic entry
  });

  it('stops contributing the synthetic amount once the missed occurrence is more than 14 days overdue', () => {
    const flow = recurringFlow({
      amount: 100,
      direction: 'out',
      cadence: { period: 'once', date: new Date(2026, 6, 1) },
    });
    const today = new Date(2026, 6, 16); // 15 days after the 07-01 occurrence
    const synced = { ...account, balanceDate: today };
    expect(withOutstandingOccurrences([flow], [], synced, today)).toEqual([flow]);
  });

  it('removes the missing amount from the projection once the occurrence is skipped (ADR-0014)', () => {
    const flow = recurringFlow({ amount: 100, direction: 'out' });
    const today = new Date('2026-08-01T15:00:00Z');
    const synced = { ...account, balance: 1000, balanceDate: new Date('2026-08-01T08:00:00Z') };
    const skipped = [{ flowId: flow.id, occurrenceDate: new Date(2026, 6, 31) }];

    expect(withOutstandingOccurrences([flow], [], synced, today, skipped)).toEqual([flow]);
    expect(balanceAtDate(synced, [], today, withOutstandingOccurrences([flow], [], synced, today, skipped))).toBe(
      1000, // no synthetic entry added, so the missed occurrence's amount doesn't land in the projection
    );
  });
});

describe('budgetProgressStatus', () => {
  it('is ok below the limit and over past it when no Tolerance is set', () => {
    expect(budgetProgressStatus(300, 400, undefined)).toBe('ok');
    expect(budgetProgressStatus(400, 400, undefined)).toBe('ok');
    expect(budgetProgressStatus(400.01, 400, undefined)).toBe('over');
  });

  it('is ok below the band, warn within it, and over past it with a percent Tolerance', () => {
    const tolerance: Tolerance = { kind: 'percent', value: 10 }; // band: 360..440
    expect(budgetProgressStatus(359, 400, tolerance)).toBe('ok');
    expect(budgetProgressStatus(360, 400, tolerance)).toBe('warn');
    expect(budgetProgressStatus(400, 400, tolerance)).toBe('warn');
    expect(budgetProgressStatus(440, 400, tolerance)).toBe('warn');
    expect(budgetProgressStatus(440.01, 400, tolerance)).toBe('over');
  });

  it('applies a fixed Tolerance as a flat-dollar band regardless of direction', () => {
    const tolerance: Tolerance = { kind: 'fixed', value: 50 }; // band: 350..450
    expect(budgetProgressStatus(349, 400, tolerance)).toBe('ok');
    expect(budgetProgressStatus(350, 400, tolerance)).toBe('warn');
    expect(budgetProgressStatus(450, 400, tolerance)).toBe('warn');
    expect(budgetProgressStatus(450.01, 400, tolerance)).toBe('over');
  });

  it('reads ok for an income Budget far under its target, unlike varianceAlert treating shortfall as a breach', () => {
    // budgetProgressStatus is symmetric and direction-agnostic: only used > limit + tolerance is 'over'.
    const tolerance: Tolerance = { kind: 'fixed', value: 100 };
    expect(budgetProgressStatus(1950, 2000, tolerance)).toBe('warn');
    expect(budgetProgressStatus(1000, 2000, tolerance)).toBe('ok');
  });
});
