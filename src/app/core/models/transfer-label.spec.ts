import { describe, expect, it } from 'vitest';
import { Account } from './account';
import { transferLabel } from './transfer-label';
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
