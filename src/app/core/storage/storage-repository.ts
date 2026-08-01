import { Injectable } from '@angular/core';
import { DBSchema, IDBPDatabase, IDBPTransaction, openDB, StoreNames } from 'idb';
import { normalizeMatchText } from '../categorization/categorization';
import { Account } from '../models/account';
import { CategorizationRule } from '../models/categorization-rule';
import { Flow } from '../models/flow';
import { Transaction } from '../models/transaction';
import { Transfer } from '../models/transfer';

interface StreamsDb extends DBSchema {
  accounts: {
    key: string;
    value: Account;
  };
  transactions: {
    key: string;
    value: Transaction;
    indexes: { accountId: string };
  };
  flows: {
    key: string;
    value: Flow;
    indexes: { accountId: string };
  };
  transfers: {
    key: string;
    value: Transfer;
  };
  categorizationRules: {
    key: string;
    value: CategorizationRule;
  };
  settings: {
    key: string;
    value: { key: string; value: string };
  };
}

/**
 * v12 migration helper: rewrites every record in `storeName` that still has `oldKey` (a Flow id,
 * string or null) into `newKey: {kind:'flow', id} | null`, in place, via a cursor. Shared by the
 * `transactions`/`categorizationRules` rewrites — same shape, different store/field names.
 */
async function migrateFlowIdField(
  transaction: IDBPTransaction<StreamsDb, ArrayLike<StoreNames<StreamsDb>>, 'versionchange'>,
  storeName: 'transactions' | 'categorizationRules',
  oldKey: string,
  newKey: string,
): Promise<void> {
  let cursor = await transaction.objectStore(storeName).openCursor();
  while (cursor) {
    const old = cursor.value as unknown as Record<string, unknown>;
    if (oldKey in old) {
      const { [oldKey]: flowId, ...rest } = old;
      await cursor.update(
        { ...rest, [newKey]: flowId ? { kind: 'flow', id: flowId } : null } as unknown as
          | Transaction
          | CategorizationRule,
      );
    }
    cursor = await cursor.continue();
  }
}

const ACCESS_URL_KEY = 'simplefinAccessUrl';
const LAST_SYNCED_AT_KEY = 'simplefinLastSyncedAt';
const OLDEST_FETCHED_AT_KEY = 'simplefinOldestFetchedAt';

/** Neither the Projection Engine nor the UI talk to IndexedDB directly — everything goes through this repository. */
@Injectable({ providedIn: 'root' })
export class StorageRepository {
  private readonly dbPromise: Promise<IDBPDatabase<StreamsDb>>;

  constructor() {
    this.dbPromise = openDB<StreamsDb>('streams', 12, {
      async upgrade(db, oldVersion, _newVersion, transaction) {
        if (oldVersion < 1) {
          db.createObjectStore('accounts', { keyPath: 'id' });
          const transactions = db.createObjectStore('transactions', { keyPath: 'id' });
          transactions.createIndex('accountId', 'accountId');
          db.createObjectStore('settings', { keyPath: 'key' });
        }
        // v2: Account gained `expectedSign`. No structural change — IndexedDB
        // stores are schemaless per-record — but bumped to mark the shape
        // change explicitly.
        if (oldVersion < 3) {
          const flows = db.createObjectStore('flows', { keyPath: 'id' });
          flows.createIndex('accountId', 'accountId');
        }
        // v4: Transaction gained `matchedFlowId` (no structural change, same
        // reasoning as v2) plus the new categorizationRules store, keyed on
        // normalized matchText so saving a rule for existing text overwrites
        // it in place.
        if (oldVersion < 4) {
          db.createObjectStore('categorizationRules', { keyPath: 'matchText' });
        }
        // v5: Flow gained `amountChanges` (Step Change / Recurring Rule
        // timeline, applying to both kinds). No structural change, same
        // reasoning as v2.
        // v6: new Transfer entity, its own store since it isn't scoped to a single Account.
        if (oldVersion < 6) {
          db.createObjectStore('transfers', { keyPath: 'id' });
        }
        // v7: Account gained `dryFloor`. No structural change, same reasoning as v2 —
        // existing Accounts read back with `dryFloor: undefined` until next resaved;
        // `account-stream`'s `load()` normalizes that to 0 on the way in.
        // v8: Flow gained `tolerance`. No structural change, same reasoning as v2 —
        // existing Flows read back with `tolerance: undefined`, which `varianceAlert`
        // already treats as "no Tolerance set, no alert."
        // v9: Cadence gained the `once` period shape and an optional `endDate` on the
        // repeating shapes. No structural change, same reasoning as v2 — existing
        // Flows/Transfers read back with no `endDate`, which `occurrencesInRange`
        // already treats as "repeats indefinitely."
        // v10: Account gained `syncStatus`. No structural change, same reasoning as v2 —
        // existing Accounts read back with `syncStatus: undefined`, which every read site
        // already treats as "ok" (never resynced/no error data yet). Also adds a new
        // `simplefinLastSyncedAt` key to the existing generic `settings` store (ADR-0004's
        // daily auto-resync throttle) — no store change needed, same as `simplefinAccessUrl`.
        // v11: adds a `simplefinOldestFetchedAt` key to the existing generic `settings` store —
        // the resumable-backfill cursor, tracking how far back transaction history has actually
        // been fetched, distinct from the `simplefinLastSyncedAt` throttle timestamp. No store
        // change needed, same as v10's addition.
        // v12: Transaction.matchedFlowId → matchedTarget, and CategorizationRule.flowId →
        // target — both now `{kind:'flow'|'transfer', id} | null`, since Transfers became a
        // valid Categorization target alongside Flows (ADR-0008). Unlike every prior version,
        // this changes an existing field's shape rather than just adding one, so it needs a
        // real cursor rewrite instead of being normalized at the read site — every pre-v12
        // record is unambiguous, since only Flows were ever matchable before now.
        if (oldVersion < 12) {
          await migrateFlowIdField(transaction, 'transactions', 'matchedFlowId', 'matchedTarget');
          await migrateFlowIdField(transaction, 'categorizationRules', 'flowId', 'target');
        }
      },
    });
  }

  async saveAccessUrl(accessUrl: string): Promise<void> {
    const db = await this.dbPromise;
    await db.put('settings', { key: ACCESS_URL_KEY, value: accessUrl });
  }

  async getAccessUrl(): Promise<string | undefined> {
    const db = await this.dbPromise;
    const row = await db.get('settings', ACCESS_URL_KEY);
    return row?.value;
  }

  /** Backs ADR-0004's once-daily auto-resync throttle. */
  async saveLastSyncedAt(timestamp: Date): Promise<void> {
    const db = await this.dbPromise;
    await db.put('settings', { key: LAST_SYNCED_AT_KEY, value: timestamp.toISOString() });
  }

  async getLastSyncedAt(): Promise<Date | undefined> {
    const db = await this.dbPromise;
    const row = await db.get('settings', LAST_SYNCED_AT_KEY);
    return row ? new Date(row.value) : undefined;
  }

  /** Backs the resumable-backfill cursor: how far back transaction history has actually been fetched. */
  async saveOldestFetchedAt(timestamp: Date): Promise<void> {
    const db = await this.dbPromise;
    await db.put('settings', { key: OLDEST_FETCHED_AT_KEY, value: timestamp.toISOString() });
  }

  async getOldestFetchedAt(): Promise<Date | undefined> {
    const db = await this.dbPromise;
    const row = await db.get('settings', OLDEST_FETCHED_AT_KEY);
    return row ? new Date(row.value) : undefined;
  }

  async upsertAccount(account: Account): Promise<void> {
    const db = await this.dbPromise;
    await db.put('accounts', account);
  }

  /** `put` keys on transaction id, so re-syncing overwrites rather than duplicates. */
  async upsertTransactions(transactions: Transaction[]): Promise<void> {
    if (transactions.length === 0) return;
    const db = await this.dbPromise;
    const tx = db.transaction('transactions', 'readwrite');
    await Promise.all([...transactions.map((t) => tx.store.put(t)), tx.done]);
  }

  async getAccounts(): Promise<Account[]> {
    const db = await this.dbPromise;
    return db.getAll('accounts');
  }

  async getTransactionsForAccount(accountId: string): Promise<Transaction[]> {
    const db = await this.dbPromise;
    return db.getAllFromIndex('transactions', 'accountId', accountId);
  }

  async upsertFlow(flow: Flow): Promise<void> {
    const db = await this.dbPromise;
    await db.put('flows', flow);
  }

  async deleteFlow(id: string): Promise<void> {
    const db = await this.dbPromise;
    await db.delete('flows', id);
  }

  async getFlowsForAccount(accountId: string): Promise<Flow[]> {
    const db = await this.dbPromise;
    return db.getAllFromIndex('flows', 'accountId', accountId);
  }

  async upsertTransfer(transfer: Transfer): Promise<void> {
    const db = await this.dbPromise;
    await db.put('transfers', transfer);
  }

  async deleteTransfer(id: string): Promise<void> {
    const db = await this.dbPromise;
    await db.delete('transfers', id);
  }

  async getTransfers(): Promise<Transfer[]> {
    const db = await this.dbPromise;
    return db.getAll('transfers');
  }

  /** A Transfer has no single owning Account, so this filters the full set rather than using an index. */
  async getTransfersForAccount(accountId: string): Promise<Transfer[]> {
    const transfers = await this.getTransfers();
    return transfers.filter((t) => t.fromAccountId === accountId || t.toAccountId === accountId);
  }

  /** Keyed on normalized matchText, so saving a rule for text that already has one overwrites it in place. */
  async upsertCategorizationRule(rule: CategorizationRule): Promise<void> {
    const db = await this.dbPromise;
    await db.put('categorizationRules', { ...rule, matchText: normalizeMatchText(rule.matchText) });
  }

  async getCategorizationRules(): Promise<CategorizationRule[]> {
    const db = await this.dbPromise;
    return db.getAll('categorizationRules');
  }

  async deleteCategorizationRule(matchText: string): Promise<void> {
    const db = await this.dbPromise;
    await db.delete('categorizationRules', normalizeMatchText(matchText));
  }

  async close(): Promise<void> {
    const db = await this.dbPromise;
    db.close();
  }

  /**
   * Dumps every object store by name, generically — not a hardcoded store
   * list — so newly added stores are picked up automatically without
   * touching this method.
   */
  async exportAll(): Promise<{ dbVersion: number; stores: Record<string, unknown[]> }> {
    const db = (await this.dbPromise) as unknown as IDBPDatabase;
    const stores: Record<string, unknown[]> = {};
    for (const name of Array.from(db.objectStoreNames)) {
      stores[name] = await db.getAll(name);
    }
    return { dbVersion: db.version, stores };
  }

  /**
   * Replaces the contents of every store named in `stores` with the given
   * records. Store names in `stores` that don't exist in the current schema
   * are ignored (e.g. importing a backup from a newer app version); stores
   * not named in `stores` are left untouched.
   */
  async importAll(stores: Record<string, unknown[]>): Promise<void> {
    const db = (await this.dbPromise) as unknown as IDBPDatabase;
    const storeNames = Array.from(db.objectStoreNames).filter((name) => name in stores);
    if (storeNames.length === 0) return;

    const tx = db.transaction(storeNames, 'readwrite');
    const operations: Promise<unknown>[] = [tx.done];
    for (const name of storeNames) {
      const store = tx.objectStore(name);
      operations.push(store.clear());
      for (const record of stores[name]) {
        operations.push(store.put(record));
      }
    }
    await Promise.all(operations);
  }
}
