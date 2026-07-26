import { Injectable } from '@angular/core';
import { DBSchema, IDBPDatabase, openDB } from 'idb';
import { Account } from '../models/account';
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
    this.dbPromise = openDB<StreamsDb>('streams', 3, {
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

  async close(): Promise<void> {
    const db = await this.dbPromise;
    db.close();
  }
}
