import { describe, expect, it } from 'vitest';
import { Transaction } from '../models/transaction';
import { balanceAtDate, balanceSeries } from './projection-engine';

const account = { balance: 1000, balanceDate: new Date('2026-07-25T12:00:00Z') };

function txn(id: string, date: string, amount: number): Transaction {
  return { id, accountId: 'acc-1', date: new Date(date), amount, description: `txn-${id}` };
}

describe('balanceAtDate', () => {
  it('returns the anchor balance at the balanceDate itself', () => {
    expect(balanceAtDate(account, [], account.balanceDate)).toBe(1000);
  });

  it('returns the anchor balance flat for any future date (no Flows yet)', () => {
    const future = new Date('2026-08-25T12:00:00Z');
    expect(balanceAtDate(account, [], future)).toBe(1000);
  });

  it('walks a single transaction backward out of the anchor', () => {
    const transactions = [txn('t1', '2026-07-20T09:00:00Z', -50)];
    const past = new Date('2026-07-19T00:00:00Z');
    // t1 happened after `past` and on/before balanceDate, so it's undone: 1000 - (-50) = 1050
    expect(balanceAtDate(account, transactions, past)).toBe(1050);
  });

  it('walks multiple transactions across several days backward', () => {
    const transactions = [
      txn('t1', '2026-07-24T09:00:00Z', -50),
      txn('t2', '2026-07-22T09:00:00Z', 200),
      txn('t3', '2026-07-10T09:00:00Z', -1000),
    ];
    const past = new Date('2026-07-21T00:00:00Z');
    // Only t1 and t2 fall after `past`: 1000 - (-50) - 200 = 850
    expect(balanceAtDate(account, transactions, past)).toBe(850);
  });

  it('sums same-day transactions correctly', () => {
    const transactions = [
      txn('t1', '2026-07-24T08:00:00Z', -30),
      txn('t2', '2026-07-24T20:00:00Z', -70),
    ];
    const past = new Date('2026-07-23T00:00:00Z');
    expect(balanceAtDate(account, transactions, past)).toBe(1100);
  });

  it('ignores transactions before the requested date', () => {
    const transactions = [txn('t1', '2026-07-01T09:00:00Z', -500)];
    const past = new Date('2026-07-15T00:00:00Z');
    expect(balanceAtDate(account, transactions, past)).toBe(1000);
  });

  it('ignores transactions after the balanceDate', () => {
    const transactions = [txn('t1', '2026-08-01T09:00:00Z', -500)];
    const past = new Date('2026-07-01T00:00:00Z');
    expect(balanceAtDate(account, transactions, past)).toBe(1000);
  });

  it('returns the anchor balance flat with an empty transaction list', () => {
    const past = new Date('2020-01-01T00:00:00Z');
    expect(balanceAtDate(account, [], past)).toBe(1000);
  });
});

describe('balanceSeries', () => {
  it('samples the balance at each given date', () => {
    const transactions = [txn('t1', '2026-07-24T09:00:00Z', -50)];
    const dates = [new Date('2026-07-19T00:00:00Z'), account.balanceDate];

    expect(balanceSeries(account, transactions, dates)).toEqual([
      { date: dates[0], balance: 1050 },
      { date: dates[1], balance: 1000 },
    ]);
  });

  it('returns an empty series for an empty date list', () => {
    expect(balanceSeries(account, [], [])).toEqual([]);
  });
});
