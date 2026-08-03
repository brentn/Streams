import { describe, expect, it } from 'vitest';
import { Account } from '../models/account';
import { Flow, RecurringFlow } from '../models/flow';
import { Transaction } from '../models/transaction';
import { Transfer } from '../models/transfer';
import {
  budgetDrillInTributary,
  buildTributaries,
  buildUncategorizedTributaries,
  withOutstandingTributaries,
} from './tributaries';

// Local-midnight parse — see cadence.spec.ts.
function d(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

const accounts: Account[] = [
  {
    id: 'acc-1',
    name: 'Checking',
    institutionName: 'Bank',
    balance: 0,
    balanceDate: d('2026-07-01'),
    expectedSign: 1,
    dryFloor: 0,
  },
  {
    id: 'acc-2',
    name: 'Savings',
    institutionName: 'Bank',
    balance: 0,
    balanceDate: d('2026-07-01'),
    expectedSign: 1,
    dryFloor: 0,
  },
];

describe('buildTributaries', () => {
  it('places one tributary per recurring Flow occurrence in the window, sized by its amount', () => {
    const flow: Flow = {
      id: 'flow-1',
      accountId: 'acc-1',
      name: 'Paycheck',
      direction: 'in',
      kind: 'recurring',
      amount: 1000,
      cadence: { period: 'week', interval: 1, anchors: [{ dayOfWeek: 5 }], anchorDate: d('2026-01-02') },
    };

    // Selected date a Friday; window spans well before/after it.
    const result = buildTributaries([flow], [], accounts, 'acc-1', d('2026-07-10'));

    expect(result.length).toBeGreaterThan(1);
    for (const t of result) {
      expect(t.kind).toBe('flow');
      expect(t.direction).toBe('in');
      expect(t.amount).toBe(1000);
      expect(t.label).toBe('Paycheck');
      expect(t.flowId).toBe('flow-1');
      expect(t.transferId).toBeUndefined();
      expect(Number.isFinite(t.x)).toBe(true);
    }
  });

  it('applies a Step Change so occurrences after it carry the new amount', () => {
    const flow: Flow = {
      id: 'flow-1',
      accountId: 'acc-1',
      name: 'Rent',
      direction: 'out',
      kind: 'recurring',
      amount: 1500,
      cadence: { period: 'month', interval: 1, anchors: [{ day: 1 }], anchorDate: d('2026-01-01') },
      amountChanges: [{ type: 'step', effectiveDate: d('2026-07-15'), amount: 1600 }],
    };

    // selectedDate centers the (now 60-day) window on 07-20, so both the 07-01 and 08-01
    // occurrences fall inside it, straddling the 07-15 Step Change.
    const result = buildTributaries([flow], [], accounts, 'acc-1', d('2026-07-20'));

    const before = result.filter((t) => t.date.getTime() < d('2026-07-15').getTime());
    const after = result.filter((t) => t.date.getTime() >= d('2026-07-15').getTime());
    expect(before.length).toBeGreaterThan(0);
    expect(after.length).toBeGreaterThan(0);
    expect(before.every((t) => t.amount === 1500)).toBe(true);
    expect(after.every((t) => t.amount === 1600)).toBe(true);
  });

  it('renders no tributary at all for a budget-kind Flow — its limit applies across the whole period, not at one point in time (#72)', () => {
    const flow: Flow = {
      id: 'budget-1',
      accountId: 'acc-1',
      name: 'Groceries',
      direction: 'out',
      kind: 'budget',
      limit: 400,
      period: 'month',
    };

    const result = buildTributaries([flow], [], accounts, 'acc-1', d('2026-07-15'));

    expect(result).toEqual([]);
  });

  it('labels a Transfer with the other account and direction, from this account\'s perspective', () => {
    const transfer: Transfer = {
      id: 'transfer-1',
      fromAccountId: 'acc-1',
      toAccountId: 'acc-2',
      amount: 200,
      cadence: { period: 'once', date: d('2026-07-10') },
    };

    const outgoing = buildTributaries([], [transfer], accounts, 'acc-1', d('2026-07-10'));
    const incoming = buildTributaries([], [transfer], accounts, 'acc-2', d('2026-07-10'));

    expect(outgoing).toEqual([
      expect.objectContaining({
        kind: 'transfer',
        direction: 'out',
        amount: 200,
        label: '→ Savings',
        transferId: 'transfer-1',
      }),
    ]);
    expect(incoming).toEqual([
      expect.objectContaining({
        kind: 'transfer',
        direction: 'in',
        amount: 200,
        label: '← Checking',
        transferId: 'transfer-1',
      }),
    ]);
    expect(outgoing[0].flowId).toBeUndefined();
  });

  it('excludes occurrences outside the visible window', () => {
    const flow: Flow = {
      id: 'flow-1',
      accountId: 'acc-1',
      name: 'One-off',
      direction: 'in',
      kind: 'recurring',
      amount: 50,
      cadence: { period: 'once', date: d('2020-01-01') },
    };

    const result = buildTributaries([flow], [], accounts, 'acc-1', d('2026-07-10'));

    expect(result).toEqual([]);
  });
});

describe('budgetDrillInTributary', () => {
  it('synthesizes a flow-kind Tributary carrying the budget-kind Flow\'s id, direction, name and limit, for the drill-in panel', () => {
    const flow: Flow = {
      id: 'budget-1',
      accountId: 'acc-1',
      name: 'Groceries',
      direction: 'out',
      kind: 'budget',
      limit: 400,
      period: 'month',
    };

    const result = budgetDrillInTributary(flow, d('2026-07-15'));

    expect(result).toEqual(
      expect.objectContaining({
        kind: 'flow',
        direction: 'out',
        amount: 400,
        label: 'Groceries',
        flowId: 'budget-1',
      }),
    );
  });
});

describe('buildUncategorizedTributaries', () => {
  function txn(overrides: Partial<Transaction>): Transaction {
    return {
      id: 'txn-1',
      accountId: 'acc-1',
      date: d('2026-07-10'),
      amount: -42,
      description: 'Coffee',
      matchedTarget: null,
      ...overrides,
    };
  }

  it('buckets same-month, same-direction unmatched Transactions into one tributary on the 1st, sized by their summed absolute amount', () => {
    const result = buildUncategorizedTributaries(
      [txn({ id: 't1', date: d('2026-07-03'), amount: -10 }), txn({ id: 't2', date: d('2026-07-28'), amount: -32 })],
      d('2026-07-10'),
    );

    expect(result).toEqual([
      expect.objectContaining({
        kind: 'uncategorized',
        direction: 'out',
        date: d('2026-07-01'),
        amount: 42,
        label: 'Uncategorized',
      }),
    ]);
    expect(result[0].flowId).toBeUndefined();
    expect(result[0].transferId).toBeUndefined();
  });

  it('derives direction from the amount sign: negative is out, positive is in', () => {
    const outgoing = buildUncategorizedTributaries([txn({ amount: -10 })], d('2026-07-10'));
    const incoming = buildUncategorizedTributaries([txn({ amount: 10 })], d('2026-07-10'));

    expect(outgoing[0].direction).toBe('out');
    expect(incoming[0].direction).toBe('in');
  });

  it('keeps income and expense as separate buckets within the same month', () => {
    const result = buildUncategorizedTributaries(
      [txn({ id: 't1', date: d('2026-07-03'), amount: -10 }), txn({ id: 't2', date: d('2026-07-05'), amount: 25 })],
      d('2026-07-10'),
    );

    expect(result).toEqual([
      expect.objectContaining({ direction: 'out', date: d('2026-07-01'), amount: 10 }),
      expect.objectContaining({ direction: 'in', date: d('2026-07-01'), amount: 25 }),
    ]);
  });

  it('renders no tributary for a direction with zero unmatched Transactions in a month, even when the other direction has some', () => {
    const result = buildUncategorizedTributaries([txn({ date: d('2026-07-03'), amount: -10 })], d('2026-07-10'));

    expect(result.some((t) => t.direction === 'in')).toBe(false);
  });

  it('excludes Transactions that already have a matched Flow', () => {
    const result = buildUncategorizedTributaries(
      [txn({ matchedTarget: { kind: 'flow', id: 'flow-1' } })],
      d('2026-07-10'),
    );

    expect(result).toEqual([]);
  });

  it('excludes buckets whose month falls outside the visible window', () => {
    const result = buildUncategorizedTributaries([txn({ date: d('2020-01-01') })], d('2026-07-10'));

    expect(result).toEqual([]);
  });
});

describe('withOutstandingTributaries (#88)', () => {
  // Weekly Friday cadence; most recent occurrence at/before 2026-08-01 (a Saturday) is 2026-07-31.
  const flow: RecurringFlow = {
    id: 'flow-1',
    accountId: 'acc-1',
    name: 'Paycheck',
    direction: 'in',
    kind: 'recurring',
    amount: 100,
    cadence: { period: 'week', interval: 1, anchors: [{ dayOfWeek: 5 }], anchorDate: d('2026-01-02') },
  };
  const today = d('2026-08-01');
  const outstandingAccount: Account = { ...accounts[0], balanceDate: today };

  it("marks the Outstanding occurrence's own real Tributary as warning, without duplicating it", () => {
    const selectedDate = d('2026-07-31');
    const tributaries = buildTributaries([flow], [], accounts, 'acc-1', selectedDate);

    const result = withOutstandingTributaries(tributaries, [flow], [], outstandingAccount, today, selectedDate);

    const atOccurrence = result.filter(
      (t) => t.flowId === 'flow-1' && t.date.getTime() === d('2026-07-31').getTime(),
    );
    expect(atOccurrence).toHaveLength(1);
    expect(atOccurrence[0].warning).toBe(true);
    // The only other warning-flagged item is the "Pending" stand-in, at today (also in this window).
    const otherWarned = result.filter((t) => t.warning && t.date.getTime() !== d('2026-07-31').getTime());
    expect(otherWarned.every((t) => t.date.getTime() === today.getTime())).toBe(true);
  });

  it("appends a synthetic 'Pending: <name>' stand-in at today's position, carrying the Flow's own id", () => {
    const selectedDate = today;
    const tributaries = buildTributaries([flow], [], accounts, 'acc-1', selectedDate);

    const result = withOutstandingTributaries(tributaries, [flow], [], outstandingAccount, today, selectedDate);

    expect(result).toHaveLength(tributaries.length + 1);
    const standIn = result.find((t) => t.label === 'Pending: Paycheck');
    expect(standIn).toMatchObject({
      kind: 'flow',
      flowId: 'flow-1',
      direction: 'in',
      amount: 100,
      date: today,
      warning: true,
    });
  });

  it('leaves the tributaries untouched when no Flow is Outstanding', () => {
    const selectedDate = today;
    const tributaries = buildTributaries([flow], [], accounts, 'acc-1', selectedDate);
    const matched: Transaction[] = [
      {
        id: 't1',
        accountId: 'acc-1',
        date: d('2026-07-31'),
        amount: 100,
        description: 'Paycheck',
        matchedTarget: { kind: 'flow', id: 'flow-1' },
      },
    ];

    const result = withOutstandingTributaries(tributaries, [flow], matched, outstandingAccount, today, selectedDate);

    expect(result).toEqual(tributaries);
  });

  it("omits the stand-in when today falls outside the selectedDate-centered visible window", () => {
    const farSelectedDate = d('2026-01-01');
    const tributaries = buildTributaries([flow], [], accounts, 'acc-1', farSelectedDate);

    const result = withOutstandingTributaries(
      tributaries,
      [flow],
      [],
      outstandingAccount,
      today,
      farSelectedDate,
    );

    expect(result.some((t) => t.label.startsWith('Pending:'))).toBe(false);
  });

  it('never marks or stands in for a budget-kind Flow — Outstanding has no occurrence timeline for it', () => {
    const budget: Flow = {
      id: 'budget-1',
      accountId: 'acc-1',
      name: 'Groceries',
      direction: 'out',
      kind: 'budget',
      limit: 400,
      period: 'month',
    };
    const selectedDate = today;
    const tributaries = buildTributaries([budget], [], accounts, 'acc-1', selectedDate);

    const result = withOutstandingTributaries(tributaries, [budget], [], outstandingAccount, today, selectedDate);

    expect(result).toEqual(tributaries);
  });
});
