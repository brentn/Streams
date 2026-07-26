import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Account } from '../models/account';
import { BudgetFlow, RecurringFlow } from '../models/flow';
import { Transaction } from '../models/transaction';
import { StorageRepository } from './storage-repository';

async function resetDb(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('streams');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

describe('StorageRepository', () => {
  let repo: StorageRepository;

  beforeEach(() => {
    repo = new StorageRepository();
  });

  afterEach(async () => {
    await repo.close();
    await resetDb();
  });

  it('round-trips the SimpleFIN access URL', async () => {
    expect(await repo.getAccessUrl()).toBeUndefined();

    await repo.saveAccessUrl('https://user:pass@bridge.simplefin.org/simplefin');

    expect(await repo.getAccessUrl()).toBe('https://user:pass@bridge.simplefin.org/simplefin');
  });

  it('upserts and retrieves accounts', async () => {
    const account: Account = {
      id: 'acc-1',
      name: 'Checking',
      institutionName: 'First Bank',
      balance: 100,
      balanceDate: new Date('2026-01-01'),
      expectedSign: 1,
    };

    await repo.upsertAccount(account);

    expect(await repo.getAccounts()).toEqual([account]);
  });

  it('upserting an account with the same id replaces it', async () => {
    const original: Account = {
      id: 'acc-1',
      name: 'Checking',
      institutionName: 'First Bank',
      balance: 100,
      balanceDate: new Date('2026-01-01'),
      expectedSign: 1,
    };
    const updated: Account = { ...original, balance: 250 };

    await repo.upsertAccount(original);
    await repo.upsertAccount(updated);

    expect(await repo.getAccounts()).toEqual([updated]);
  });

  it('upserts transactions and dedupes by id on re-sync', async () => {
    const t1: Transaction = {
      id: 'txn-1',
      accountId: 'acc-1',
      date: new Date('2026-01-01'),
      amount: -10,
      description: 'Coffee',
    };
    const t1Updated: Transaction = { ...t1, amount: -12 };
    const t2: Transaction = {
      id: 'txn-2',
      accountId: 'acc-1',
      date: new Date('2026-01-02'),
      amount: 500,
      description: 'Payroll',
    };

    await repo.upsertTransactions([t1]);
    await repo.upsertTransactions([t1Updated, t2]);

    const stored = await repo.getTransactionsForAccount('acc-1');
    expect(stored).toHaveLength(2);
    expect(stored).toContainEqual(t1Updated);
    expect(stored).toContainEqual(t2);
  });

  it('scopes getTransactionsForAccount to the given account', async () => {
    const t1: Transaction = {
      id: 'txn-1',
      accountId: 'acc-1',
      date: new Date('2026-01-01'),
      amount: -10,
      description: 'Coffee',
    };
    const t2: Transaction = {
      id: 'txn-2',
      accountId: 'acc-2',
      date: new Date('2026-01-02'),
      amount: 500,
      description: 'Payroll',
    };

    await repo.upsertTransactions([t1, t2]);

    expect(await repo.getTransactionsForAccount('acc-1')).toEqual([t1]);
  });

  it('upserts and retrieves Flows for an account', async () => {
    const recurring: RecurringFlow = {
      id: 'flow-1',
      accountId: 'acc-1',
      name: 'Paycheck',
      direction: 'in',
      kind: 'recurring',
      amount: 2000,
      cadence: {
        period: 'week',
        interval: 2,
        anchors: [{ dayOfWeek: 5 }],
        anchorDate: new Date(2026, 0, 2),
      },
    };
    const budget: BudgetFlow = {
      id: 'flow-2',
      accountId: 'acc-2',
      name: 'Groceries',
      direction: 'out',
      kind: 'budget',
      limit: 400,
      period: 'month',
    };

    await repo.upsertFlow(recurring);
    await repo.upsertFlow(budget);

    expect(await repo.getFlowsForAccount('acc-1')).toEqual([recurring]);
    expect(await repo.getFlowsForAccount('acc-2')).toEqual([budget]);
  });

  it('upserting a Flow with the same id replaces it', async () => {
    const original: BudgetFlow = {
      id: 'flow-1',
      accountId: 'acc-1',
      name: 'Groceries',
      direction: 'out',
      kind: 'budget',
      limit: 400,
      period: 'month',
    };
    const updated: BudgetFlow = { ...original, limit: 500 };

    await repo.upsertFlow(original);
    await repo.upsertFlow(updated);

    expect(await repo.getFlowsForAccount('acc-1')).toEqual([updated]);
  });

  it('deletes a Flow by id', async () => {
    const flow: BudgetFlow = {
      id: 'flow-1',
      accountId: 'acc-1',
      name: 'Groceries',
      direction: 'out',
      kind: 'budget',
      limit: 400,
      period: 'month',
    };

    await repo.upsertFlow(flow);
    await repo.deleteFlow('flow-1');

    expect(await repo.getFlowsForAccount('acc-1')).toEqual([]);
  });
});
