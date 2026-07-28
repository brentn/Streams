import { Injectable } from '@angular/core';
import { DBSchema, IDBPDatabase, openDB } from 'idb';
import { normalizeMatchText } from '../categorization/categorization';
import { Account } from '../models/account';
import { CategorizationRule } from '../models/categorization-rule';
import { Flow } from '../models/flow';
import { Transaction } from '../models/transaction';

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
  categorizationRules: {
    key: string;
    value: CategorizationRule;
  };
  settings: {
    key: string;
    value: { key: string; value: string };
  };
}

const ACCESS_URL_KEY = 'simplefinAccessUrl';

/** Neither the Projection Engine nor the UI talk to IndexedDB directly — everything goes through this repository. */
@Injectable({ providedIn: 'root' })
export class StorageRepository {
  private readonly dbPromise: Promise<IDBPDatabase<StreamsDb>>;

  constructor() {
    this.dbPromise = openDB<StreamsDb>('streams', 5, {
      upgrade(db, oldVersion) {
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

  /** Keyed on normalized matchText, so saving a rule for text that already has one overwrites it in place. */
  async upsertCategorizationRule(rule: CategorizationRule): Promise<void> {
    const db = await this.dbPromise;
    await db.put('categorizationRules', { ...rule, matchText: normalizeMatchText(rule.matchText) });
  }

  async getCategorizationRules(): Promise<CategorizationRule[]> {
    const db = await this.dbPromise;
    return db.getAll('categorizationRules');
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
