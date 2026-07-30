import { describe, expect, it } from 'vitest';
import { Account } from '../models/account';
import { Flow } from '../models/flow';
import { Transaction } from '../models/transaction';
import { Transfer } from '../models/transfer';
import { buildTributaries, buildUncategorizedTributaries } from './tributaries';

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

  it('synthesizes one occurrence per renewal period for a budget-kind Flow', () => {
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

    expect(result.length).toBeGreaterThanOrEqual(1);
    for (const t of result) {
      expect(t.amount).toBe(400);
      expect(t.label).toBe('Groceries');
    }
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
      expect.objectContaining({ kind: 'transfer', direction: 'out', amount: 200, label: '→ Savings' }),
    ]);
    expect(incoming).toEqual([
      expect.objectContaining({ kind: 'transfer', direction: 'in', amount: 200, label: '← Checking' }),
    ]);
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

describe('buildUncategorizedTributaries', () => {
  function txn(overrides: Partial<Transaction>): Transaction {
    return {
      id: 'txn-1',
      accountId: 'acc-1',
      date: d('2026-07-10'),
      amount: -42,
      description: 'Coffee',
      matchedFlowId: null,
      ...overrides,
    };
  }

  it('places one tributary per unmatched Transaction in the window, sized by its absolute amount', () => {
    const result = buildUncategorizedTributaries([txn({})], d('2026-07-10'));

    expect(result).toEqual([
      expect.objectContaining({ kind: 'uncategorized', direction: 'out', amount: 42, label: 'Uncategorized' }),
    ]);
  });

  it('derives direction from the amount sign: negative is out, positive is in', () => {
    const outgoing = buildUncategorizedTributaries([txn({ amount: -10 })], d('2026-07-10'));
    const incoming = buildUncategorizedTributaries([txn({ amount: 10 })], d('2026-07-10'));

    expect(outgoing[0].direction).toBe('out');
    expect(incoming[0].direction).toBe('in');
  });

  it('excludes Transactions that already have a matched Flow', () => {
    const result = buildUncategorizedTributaries([txn({ matchedFlowId: 'flow-1' })], d('2026-07-10'));

    expect(result).toEqual([]);
  });

  it('excludes unmatched Transactions outside the visible window', () => {
    const result = buildUncategorizedTributaries([txn({ date: d('2020-01-01') })], d('2026-07-10'));

    expect(result).toEqual([]);
  });
});
