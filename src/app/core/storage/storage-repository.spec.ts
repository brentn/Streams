import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Account } from '../models/account';
import { CategorizationRule } from '../models/categorization-rule';
import { BudgetFlow, RecurringFlow } from '../models/flow';
import { SkippedOccurrence } from '../models/skipped-occurrence';
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

  it('round-trips the last-synced timestamp', async () => {
    expect(await repo.getLastSyncedAt()).toBeUndefined();

    const timestamp = new Date('2026-07-25T12:00:00Z');
    await repo.saveLastSyncedAt(timestamp);

    expect(await repo.getLastSyncedAt()).toEqual(timestamp);
  });

  it('round-trips the backfill cursor (oldest fetched date)', async () => {
    expect(await repo.getOldestFetchedAt()).toBeUndefined();

    const timestamp = new Date('2026-04-01T00:00:00Z');
    await repo.saveOldestFetchedAt(timestamp);

    expect(await repo.getOldestFetchedAt()).toEqual(timestamp);
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
      matchedTarget: null,
    };
    const t1Updated: Transaction = { ...t1, amount: -12 };
    const t2: Transaction = {
      id: 'txn-2',
      accountId: 'acc-1',
      date: new Date('2026-01-02'),
      amount: 500,
      description: 'Payroll',
      matchedTarget: null,
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
      matchedTarget: null,
    };
    const t2: Transaction = {
      id: 'txn-2',
      accountId: 'acc-2',
      date: new Date('2026-01-02'),
      amount: 500,
      description: 'Payroll',
      matchedTarget: null,
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
    const rule: CategorizationRule = { matchText: 'amazon prime', target: { kind: 'flow', id: 'flow-1' } };

    await repo.upsertCategorizationRule(rule);

    expect(await repo.getCategorizationRules()).toEqual([rule]);
  });

  it('normalizes matchText so re-saving the same text (any case/whitespace) overwrites the rule in place', async () => {
    await repo.upsertCategorizationRule({ matchText: 'Amazon Prime', target: { kind: 'flow', id: 'flow-1' } });
    await repo.upsertCategorizationRule({ matchText: '  AMAZON PRIME  ', target: { kind: 'flow', id: 'flow-2' } });

    const rules = await repo.getCategorizationRules();
    expect(rules).toEqual([{ matchText: 'amazon prime', target: { kind: 'flow', id: 'flow-2' } }]);
  });

  it('deletes a Categorization Rule by matchText', async () => {
    const rule: CategorizationRule = { matchText: 'amazon prime', target: { kind: 'flow', id: 'flow-1' } };
    await repo.upsertCategorizationRule(rule);

    await repo.deleteCategorizationRule('amazon prime');

    expect(await repo.getCategorizationRules()).toEqual([]);
  });

  it('normalizes matchText when deleting a Categorization Rule', async () => {
    await repo.upsertCategorizationRule({ matchText: 'amazon prime', target: { kind: 'flow', id: 'flow-1' } });

    await repo.deleteCategorizationRule('  AMAZON PRIME  ');

    expect(await repo.getCategorizationRules()).toEqual([]);
  });

  it('upserts and retrieves Skipped Occurrences', async () => {
    const occurrence: SkippedOccurrence = { flowId: 'flow-1', occurrenceDate: new Date('2026-07-31') };

    await repo.upsertSkippedOccurrence(occurrence);

    expect(await repo.getSkippedOccurrences()).toEqual([occurrence]);
  });

  it('upserting the same (flowId, occurrenceDate) pair again overwrites in place rather than duplicating', async () => {
    const occurrence: SkippedOccurrence = { flowId: 'flow-1', occurrenceDate: new Date('2026-07-31') };

    await repo.upsertSkippedOccurrence(occurrence);
    await repo.upsertSkippedOccurrence(occurrence);

    expect(await repo.getSkippedOccurrences()).toEqual([occurrence]);
  });

  it('treats a different occurrenceDate on the same Flow as a distinct Skipped Occurrence', async () => {
    const first: SkippedOccurrence = { flowId: 'flow-1', occurrenceDate: new Date('2026-07-31') };
    const second: SkippedOccurrence = { flowId: 'flow-1', occurrenceDate: new Date('2026-08-07') };

    await repo.upsertSkippedOccurrence(first);
    await repo.upsertSkippedOccurrence(second);

    const stored = await repo.getSkippedOccurrences();
    expect(stored).toHaveLength(2);
    expect(stored).toContainEqual(first);
    expect(stored).toContainEqual(second);
  });

  describe('reidAccount', () => {
    const oldAccount: Account = {
      id: 'old-id',
      name: 'Chequing',
      institutionName: 'Coast Capital',
      balance: 100,
      balanceDate: new Date('2026-08-01'),
      expectedSign: 1,
      dryFloor: 0,
    };
    const newAccount: Account = { ...oldAccount, id: 'new-id', balance: 3098.77 };

    it('re-keys the Account: old id gone, new id present with the given payload', async () => {
      await repo.upsertAccount(oldAccount);

      await repo.reidAccount('old-id', newAccount);

      expect(await repo.getAccounts()).toEqual([newAccount]);
    });

    it('rewrites every Transaction.accountId that pointed at the old id, leaving unrelated ones untouched', async () => {
      const own: Transaction = {
        id: 'txn-1',
        accountId: 'old-id',
        date: new Date('2026-07-01'),
        amount: -10,
        description: 'Coffee',
        matchedTarget: null,
      };
      const unrelated: Transaction = {
        id: 'txn-2',
        accountId: 'other-account',
        date: new Date('2026-07-02'),
        amount: -5,
        description: 'Tea',
        matchedTarget: null,
      };
      await repo.upsertAccount(oldAccount);
      await repo.upsertTransactions([own, unrelated]);

      await repo.reidAccount('old-id', newAccount);

      expect(await repo.getTransactionsForAccount('new-id')).toEqual([{ ...own, accountId: 'new-id' }]);
      expect(await repo.getTransactionsForAccount('other-account')).toEqual([unrelated]);
    });

    it('rewrites every Flow.accountId that pointed at the old id, leaving unrelated ones untouched', async () => {
      const own: BudgetFlow = {
        id: 'flow-1',
        accountId: 'old-id',
        name: 'Groceries',
        direction: 'out',
        kind: 'budget',
        limit: 400,
        period: 'month',
      };
      const unrelated: BudgetFlow = { ...own, id: 'flow-2', accountId: 'other-account' };
      await repo.upsertAccount(oldAccount);
      await repo.upsertFlow(own);
      await repo.upsertFlow(unrelated);

      await repo.reidAccount('old-id', newAccount);

      expect(await repo.getFlowsForAccount('new-id')).toEqual([{ ...own, accountId: 'new-id' }]);
      expect(await repo.getFlowsForAccount('other-account')).toEqual([unrelated]);
    });

    it('rewrites a Transfer referencing the old id on either side, leaving one between two other accounts untouched', async () => {
      const outgoing: Transfer = {
        id: 'transfer-1',
        fromAccountId: 'old-id',
        toAccountId: 'other-account',
        amount: 200,
        cadence: { period: 'once', date: new Date('2026-07-10') },
      };
      const incoming: Transfer = {
        id: 'transfer-2',
        fromAccountId: 'other-account',
        toAccountId: 'old-id',
        amount: 50,
        cadence: { period: 'once', date: new Date('2026-07-11') },
      };
      const unrelated: Transfer = {
        id: 'transfer-3',
        fromAccountId: 'other-account',
        toAccountId: 'another-account',
        amount: 10,
        cadence: { period: 'once', date: new Date('2026-07-12') },
      };
      await repo.upsertAccount(oldAccount);
      await repo.upsertTransfer(outgoing);
      await repo.upsertTransfer(incoming);
      await repo.upsertTransfer(unrelated);

      await repo.reidAccount('old-id', newAccount);

      const transfers = await repo.getTransfers();
      expect(transfers).toContainEqual({ ...outgoing, fromAccountId: 'new-id' });
      expect(transfers).toContainEqual({ ...incoming, toAccountId: 'new-id' });
      expect(transfers).toContainEqual(unrelated);
    });

    it('re-keys cleanly when the old account has no transactions, flows, or transfers at all', async () => {
      await repo.upsertAccount(oldAccount);

      await expect(repo.reidAccount('old-id', newAccount)).resolves.toBeUndefined();

      expect(await repo.getAccounts()).toEqual([newAccount]);
    });
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
          'skippedOccurrences',
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

      expect(dbVersion).toBe(16);
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
      const rule: CategorizationRule = { matchText: 'kept rule', target: { kind: 'flow', id: 'flow-x' } };
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
        matchedTarget: null,
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

describe('v12 migration', () => {
  afterEach(async () => {
    await resetDb();
  });

  /** Opens the raw v11 database directly (bypassing StorageRepository) to seed pre-migration, old-shape records. */
  async function seedV11Database(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('streams', 11);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('accounts', { keyPath: 'id' });
        const transactions = db.createObjectStore('transactions', { keyPath: 'id' });
        transactions.createIndex('accountId', 'accountId');
        db.createObjectStore('settings', { keyPath: 'key' });
        db.createObjectStore('categorizationRules', { keyPath: 'matchText' });
        const flows = db.createObjectStore('flows', { keyPath: 'id' });
        flows.createIndex('accountId', 'accountId');
        db.createObjectStore('transfers', { keyPath: 'id' });
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(['transactions', 'categorizationRules'], 'readwrite');
        tx.objectStore('transactions').put({
          id: 'txn-1',
          accountId: 'acc-1',
          date: new Date('2026-01-02'),
          amount: -10,
          description: 'Coffee',
          matchedFlowId: 'flow-coffee',
        });
        tx.objectStore('transactions').put({
          id: 'txn-2',
          accountId: 'acc-1',
          date: new Date('2026-01-03'),
          amount: 2000,
          description: 'Payroll',
          matchedFlowId: null,
        });
        tx.objectStore('categorizationRules').put({ matchText: 'coffee', flowId: 'flow-coffee' });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  }

  it('rewrites matchedFlowId/flowId records into matchedTarget/target on first open at v12', async () => {
    await seedV11Database();

    const repo = new StorageRepository();
    const transactions = await repo.getTransactionsForAccount('acc-1');
    const rules = await repo.getCategorizationRules();
    await repo.close();

    expect(transactions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'txn-1', matchedTarget: { kind: 'flow', id: 'flow-coffee' } }),
        expect.objectContaining({ id: 'txn-2', matchedTarget: null }),
      ]),
    );
    expect(rules).toEqual([{ matchText: 'coffee', target: { kind: 'flow', id: 'flow-coffee' } }]);
  });
});

describe('v13 migration', () => {
  const DAY_MS = 24 * 60 * 60 * 1000;

  afterEach(async () => {
    await resetDb();
  });

  /** Opens the raw v12 database directly (bypassing StorageRepository) to seed a pre-migration cursor. */
  async function seedV12Database(oldestFetchedAt?: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('streams', 12);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('accounts', { keyPath: 'id' });
        const transactions = db.createObjectStore('transactions', { keyPath: 'id' });
        transactions.createIndex('accountId', 'accountId');
        db.createObjectStore('settings', { keyPath: 'key' });
        db.createObjectStore('categorizationRules', { keyPath: 'matchText' });
        const flows = db.createObjectStore('flows', { keyPath: 'id' });
        flows.createIndex('accountId', 'accountId');
        db.createObjectStore('transfers', { keyPath: 'id' });
      };
      req.onsuccess = () => {
        const db = req.result;
        if (oldestFetchedAt === undefined) {
          db.close();
          resolve();
          return;
        }
        const tx = db.transaction('settings', 'readwrite');
        tx.objectStore('settings').put({ key: 'simplefinOldestFetchedAt', value: oldestFetchedAt });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  }

  it('resets a cursor drifted beyond the Sync Floor to the Sync Floor', async () => {
    const beforeMigration = new Date();
    await seedV12Database(new Date(beforeMigration.getTime() - 400 * DAY_MS).toISOString());

    const repo = new StorageRepository();
    const cursor = await repo.getOldestFetchedAt();
    await repo.close();
    const afterMigration = new Date();

    // The migration computes "now" at the moment it runs, somewhere between beforeMigration and
    // afterMigration — assert the reset cursor lands within the Sync Floor for that whole window
    // rather than pinning an exact timestamp.
    expect(cursor).toBeDefined();
    expect(cursor!.getTime()).toBeGreaterThanOrEqual(beforeMigration.getTime() - 40 * DAY_MS);
    expect(cursor!.getTime()).toBeLessThanOrEqual(afterMigration.getTime() - 40 * DAY_MS);
  });

  it('leaves a cursor within the Sync Floor untouched', async () => {
    const withinFloor = new Date(Date.now() - 10 * DAY_MS);
    await seedV12Database(withinFloor.toISOString());

    const repo = new StorageRepository();
    const cursor = await repo.getOldestFetchedAt();
    await repo.close();

    expect(cursor).toEqual(withinFloor);
  });

  it('leaves accounts with no stored cursor untouched', async () => {
    await seedV12Database(undefined);

    const repo = new StorageRepository();
    const cursor = await repo.getOldestFetchedAt();
    await repo.close();

    expect(cursor).toBeUndefined();
  });
});

describe('v15 migration', () => {
  afterEach(async () => {
    await resetDb();
  });

  /**
   * Opens a raw v14 database directly (bypassing StorageRepository) without creating the
   * `skippedOccurrences` store — reproducing an install that already reports version 14 but
   * never actually got the store, as if a prior versionchange transaction had been interrupted
   * partway through v14's own upgrade step.
   */
  async function seedV14DatabaseMissingSkippedOccurrences(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('streams', 14);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('accounts', { keyPath: 'id' });
        const transactions = db.createObjectStore('transactions', { keyPath: 'id' });
        transactions.createIndex('accountId', 'accountId');
        db.createObjectStore('settings', { keyPath: 'key' });
        db.createObjectStore('categorizationRules', { keyPath: 'matchText' });
        const flows = db.createObjectStore('flows', { keyPath: 'id' });
        flows.createIndex('accountId', 'accountId');
        db.createObjectStore('transfers', { keyPath: 'id' });
      };
      req.onsuccess = () => {
        req.result.close();
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  }

  it('creates the missing skippedOccurrences store on an install stuck reporting v14 without it', async () => {
    await seedV14DatabaseMissingSkippedOccurrences();

    const repo = new StorageRepository();
    const occurrence: SkippedOccurrence = { flowId: 'flow-1', occurrenceDate: new Date('2026-07-01') };
    await repo.upsertSkippedOccurrence(occurrence);
    const stored = await repo.getSkippedOccurrences();
    await repo.close();

    expect(stored).toEqual([occurrence]);
  });
});
