import { describe, expect, it } from 'vitest';
import { Account } from './account';
import { transferLabel, transferOptionLabel } from './transfer-label';
import { Transfer } from './transfer';

function account(id: string, name: string): Account {
  return {
    id,
    name,
    institutionName: 'Bank',
    balance: 0,
    balanceDate: new Date('2026-01-01'),
    expectedSign: 1,
    dryFloor: 0,
  };
}

const accounts: Account[] = [account('acc-1', 'Checking'), account('acc-2', 'Savings')];

const transfer: Transfer = {
  id: 'transfer-1',
  fromAccountId: 'acc-1',
  toAccountId: 'acc-2',
  amount: 500,
  cadence: { period: 'month', interval: 1, anchors: [{ day: 1 }], anchorDate: new Date('2026-01-01') },
};

describe('transferLabel', () => {
  it('labels the outgoing side as "Transfer to" the other Account', () => {
    expect(transferLabel(transfer, 'acc-1', accounts)).toBe('Transfer to Savings');
  });

  it('labels the incoming side as "Transfer from" the other Account', () => {
    expect(transferLabel(transfer, 'acc-2', accounts)).toBe('Transfer from Checking');
  });

  it('falls back gracefully when the other Account is not in the given list', () => {
    expect(transferLabel(transfer, 'acc-1', [])).toBe('Transfer to (unknown account)');
  });
});

describe('transferOptionLabel', () => {
  // Local-midnight construction (not `new Date(iso)`, which parses a date-only string as UTC
  // and would drift a day off when formatted — see cadence.spec.ts's `d()` helper).
  const asOfDate = new Date(2026, 6, 20);

  it('appends the most-recent occurrence at or before asOfDate', () => {
    // Monthly on the 1st — most recent occurrence at/before Jul 20 is Jul 1.
    expect(transferOptionLabel(transfer, 'acc-1', accounts, asOfDate)).toBe(
      'Transfer to Savings — Jul 1, 2026',
    );
  });

  it('falls back to the next occurrence when asOfDate predates the Transfer\'s first occurrence', () => {
    const oneTime: Transfer = {
      ...transfer,
      cadence: { period: 'once', date: new Date(2026, 8, 15) },
    };
    expect(transferOptionLabel(oneTime, 'acc-1', accounts, asOfDate)).toBe(
      'Transfer to Savings — Sep 15, 2026',
    );
  });

  it('preserves the "to"/"from" framing from transferLabel', () => {
    expect(transferOptionLabel(transfer, 'acc-2', accounts, asOfDate)).toBe(
      'Transfer from Checking — Jul 1, 2026',
    );
  });

  it('preserves the unknown-account fallback from transferLabel', () => {
    expect(transferOptionLabel(transfer, 'acc-1', [], asOfDate)).toBe(
      'Transfer to (unknown account) — Jul 1, 2026',
    );
  });
});
