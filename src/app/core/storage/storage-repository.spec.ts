import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Account } from '../models/account';
import { CategorizationRule } from '../models/categorization-rule';
import { BudgetFlow, RecurringFlow } from '../models/flow';
import { Transaction } from '../models/transaction';
import { Transfer } from '../models/transfer';
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
      dryFloor: 0,
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
      dryFloor: 0,
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
      matchedFlowId: null,
    };
    const t1Updated: Transaction = { ...t1, amount: -12 };
    const t2: Transaction = {
      id: 'txn-2',
      accountId: 'acc-1',
      date: new Date('2026-01-02'),
      amount: 500,
      description: 'Payroll',
      matchedFlowId: null,
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
      matchedFlowId: null,
    };
    const t2: Transaction = {
      id: 'txn-2',
      accountId: 'acc-2',
      date: new Date('2026-01-02'),
      amount: 500,
      description: 'Payroll',
      matchedFlowId: null,
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

  it('round-trips a Flow carrying Step Changes and Recurring Rules', async () => {
    const flow: RecurringFlow = {
      id: 'flow-1',
      accountId: 'acc-1',
      name: 'Paycheck',
      direction: 'in',
      kind: 'recurring',
      amount: 2000,
      cadence: {
        period: 'month',
        interval: 1,
        anchors: [{ day: 1 }],
        anchorDate: new Date(2026, 0, 1),
      },
      amountChanges: [
        { type: 'step', effectiveDate: new Date('2027-01-01'), amount: 2200 },
        { type: 'recurring-rule', anniversaryDate: new Date('2026-10-01'), delta: 50 },
      ],
    };

    await repo.upsertFlow(flow);

    expect(await repo.getFlowsForAccount('acc-1')).toEqual([flow]);
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

  it('upserts and retrieves Transfers', async () => {
    const transfer: Transfer = {
      id: 'transfer-1',
      fromAccountId: 'acc-1',
      toAccountId: 'acc-2',
      amount: 500,
      cadence: {
        period: 'month',
        interval: 1,
        anchors: [{ day: 1 }],
        anchorDate: new Date(2026, 0, 1),
      },
    };

    await repo.upsertTransfer(transfer);

    expect(await repo.getTransfers()).toEqual([transfer]);
  });

  it('upserting a Transfer with the same id replaces it', async () => {
    const original: Transfer = {
      id: 'transfer-1',
      fromAccountId: 'acc-1',
      toAccountId: 'acc-2',
      amount: 500,
      cadence: {
        period: 'month',
        interval: 1,
        anchors: [{ day: 1 }],
        anchorDate: new Date(2026, 0, 1),
      },
    };
    const updated: Transfer = { ...original, amount: 750 };

    await repo.upsertTransfer(original);
    await repo.upsertTransfer(updated);

    expect(await repo.getTransfers()).toEqual([updated]);
  });

  it('scopes getTransfersForAccount to Transfers where the account is either the from- or to-side', async () => {
    const outgoing: Transfer = {
      id: 'transfer-1',
      fromAccountId: 'acc-1',
      toAccountId: 'acc-2',
      amount: 500,
      cadence: {
        period: 'month',
        interval: 1,
        anchors: [{ day: 1 }],
        anchorDate: new Date(2026, 0, 1),
      },
    };
    const incoming: Transfer = {
      id: 'transfer-2',
      fromAccountId: 'acc-3',
      toAccountId: 'acc-1',
      amount: 200,
      cadence: {
        period: 'month',
        interval: 1,
        anchors: [{ day: 15 }],
        anchorDate: new Date(2026, 0, 1),
      },
    };
    const unrelated: Transfer = {
      id: 'transfer-3',
      fromAccountId: 'acc-2',
      toAccountId: 'acc-3',
      amount: 50,
      cadence: {
        period: 'month',
        interval: 1,
        anchors: [{ day: 1 }],
        anchorDate: new Date(2026, 0, 1),
      },
    };

    await repo.upsertTransfer(outgoing);
    await repo.upsertTransfer(incoming);
    await repo.upsertTransfer(unrelated);

    const forAcc1 = await repo.getTransfersForAccount('acc-1');
    expect(forAcc1).toHaveLength(2);
    expect(forAcc1).toContainEqual(outgoing);
    expect(forAcc1).toContainEqual(incoming);
  });

  it('deletes a Transfer by id', async () => {
    const transfer: Transfer = {
      id: 'transfer-1',
      fromAccountId: 'acc-1',
      toAccountId: 'acc-2',
      amount: 500,
      cadence: {
        period: 'month',
        interval: 1,
        anchors: [{ day: 1 }],
        anchorDate: new Date(2026, 0, 1),
      },
    };

    await repo.upsertTransfer(transfer);
    await repo.deleteTransfer('transfer-1');

    expect(await repo.getTransfers()).toEqual([]);
  });

  it('upserts and retrieves Categorization Rules', async () => {
    const rule: CategorizationRule = { matchText: 'amazon prime', flowId: 'flow-1' };

    await repo.upsertCategorizationRule(rule);

    expect(await repo.getCategorizationRules()).toEqual([rule]);
  });

  it('normalizes matchText so re-saving the same text (any case/whitespace) overwrites the rule in place', async () => {
    await repo.upsertCategorizationRule({ matchText: 'Amazon Prime', flowId: 'flow-1' });
    await repo.upsertCategorizationRule({ matchText: '  AMAZON PRIME  ', flowId: 'flow-2' });

    const rules = await repo.getCategorizationRules();
    expect(rules).toEqual([{ matchText: 'amazon prime', flowId: 'flow-2' }]);
  });

  describe('exportAll / importAll', () => {
    it('exports every object store currently in the schema, keyed by store name', async () => {
      const account: Account = {
        id: 'acc-1',
        name: 'Checking',
        institutionName: 'First Bank',
        balance: 100,
        balanceDate: new Date('2026-01-01'),
        expectedSign: 1,
        dryFloor: 0,
      };
      await repo.upsertAccount(account);
      await repo.saveAccessUrl('https://user:pass@bridge.simplefin.org/simplefin');

      const { stores } = await repo.exportAll();

      expect(Object.keys(stores).sort()).toEqual(
        [
          'accounts',
          'categorizationRules',
          'flows',
          'settings',
          'transactions',
          'transfers',
        ].sort(),
      );
      expect(stores['accounts']).toEqual([account]);
      expect(stores['settings']).toEqual([
        { key: 'simplefinAccessUrl', value: 'https://user:pass@bridge.simplefin.org/simplefin' },
      ]);
      expect(stores['transactions']).toEqual([]);
    });

    it('reports the current database version alongside the dumped stores', async () => {
      const { dbVersion } = await repo.exportAll();

      expect(dbVersion).toBe(8);
    });

    it('importAll replaces the contents of every named store, leaving stores absent from the bundle untouched', async () => {
      const staleAccount: Account = {
        id: 'stale',
        name: 'Old',
        institutionName: 'Old Bank',
        balance: 1,
        balanceDate: new Date('2020-01-01'),
        expectedSign: 1,
        dryFloor: 0,
      };
      await repo.upsertAccount(staleAccount);
      const rule: CategorizationRule = { matchText: 'kept rule', flowId: 'flow-x' };
      await repo.upsertCategorizationRule(rule);

      const incomingAccount: Account = {
        id: 'acc-2',
        name: 'Savings',
        institutionName: 'New Bank',
        balance: 500,
        balanceDate: new Date('2026-02-01'),
        expectedSign: 1,
        dryFloor: 0,
      };
      await repo.importAll({ accounts: [incomingAccount], transactions: [] });

      expect(await repo.getAccounts()).toEqual([incomingAccount]);
      expect(await repo.getCategorizationRules()).toEqual([rule]);
    });

    it('ignores store names in the bundle that do not exist in the current schema', async () => {
      await expect(
        repo.importAll({ accounts: [], somethingFromAFutureVersion: [{ id: 'x' }] }),
      ).resolves.toBeUndefined();
      expect(await repo.getAccounts()).toEqual([]);
    });

    it('round-trips a full export through import', async () => {
      const account: Account = {
        id: 'acc-1',
        name: 'Checking',
        institutionName: 'First Bank',
        balance: 100,
        balanceDate: new Date('2026-01-01'),
        expectedSign: 1,
        dryFloor: 0,
      };
      const transaction: Transaction = {
        id: 'txn-1',
        accountId: 'acc-1',
        date: new Date('2026-01-02'),
        amount: -10,
        description: 'Coffee',
        matchedFlowId: null,
      };
      await repo.upsertAccount(account);
      await repo.upsertTransactions([transaction]);
      const { stores } = await repo.exportAll();

      await repo.close();
      await resetDb();
      repo = new StorageRepository();
      await repo.importAll(stores);

      expect(await repo.getAccounts()).toEqual([account]);
      expect(await repo.getTransactionsForAccount('acc-1')).toEqual([transaction]);
    });
  });
});
