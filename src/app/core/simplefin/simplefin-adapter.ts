import { Injectable } from '@angular/core';
import { Account } from '../models/account';
import { Transaction } from '../models/transaction';

interface SimpleFinTransaction {
  id: string;
  posted: number;
  amount: string;
  description: string;
}

interface SimpleFinAccount {
  id: string;
  name: string;
  org?: { name?: string };
  balance: string;
  'balance-date': number;
  transactions: SimpleFinTransaction[];
}

interface SimpleFinAccountsResponse {
  accounts: SimpleFinAccount[];
}

export interface SyncedAccount {
  account: Account;
  transactions: Transaction[];
}

/**
 * Thin client for the SimpleFIN protocol: setup-token claim, then Basic Auth
 * per request against the resulting Access URL. Per ADR-0002, SimpleFIN
 * Bridge returns CORS headers that allow calling it directly from the browser.
 */
@Injectable({ providedIn: 'root' })
export class SimpleFinAdapter {
  async claimAccessUrl(setupToken: string): Promise<string> {
    const claimUrl = atob(setupToken.trim());
    const response = await fetch(claimUrl, { method: 'POST' });
    if (!response.ok) {
      throw new Error(`SimpleFIN claim failed: ${response.status} ${response.statusText}`);
    }
    return (await response.text()).trim();
  }

  async fetchAccounts(accessUrl: string): Promise<SyncedAccount[]> {
    const { baseUrl, username, password } = parseAccessUrl(accessUrl);
    const response = await fetch(`${baseUrl}/accounts`, {
      headers: { Authorization: `Basic ${btoa(`${username}:${password}`)}` },
    });
    if (!response.ok) {
      throw new Error(`SimpleFIN accounts fetch failed: ${response.status} ${response.statusText}`);
    }
    const data = (await response.json()) as SimpleFinAccountsResponse;
    return data.accounts.map(toSyncedAccount);
  }
}

function parseAccessUrl(accessUrl: string): { baseUrl: string; username: string; password: string } {
  const url = new URL(accessUrl);
  const username = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  url.username = '';
  url.password = '';
  return { baseUrl: url.toString().replace(/\/$/, ''), username, password };
}

function toSyncedAccount(raw: SimpleFinAccount): SyncedAccount {
  return {
    account: {
      id: raw.id,
      name: raw.name,
      institutionName: raw.org?.name ?? '',
      balance: Number(raw.balance),
      balanceDate: new Date(raw['balance-date'] * 1000),
    },
    transactions: raw.transactions.map((txn) => ({
      id: txn.id,
      accountId: raw.id,
      date: new Date(txn.posted * 1000),
      amount: Number(txn.amount),
      description: txn.description,
    })),
  };
}
