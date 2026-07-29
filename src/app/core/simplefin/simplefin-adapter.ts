import { Injectable } from '@angular/core';
import { Account, AccountSyncStatus } from '../models/account';
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

/** SimpleFIN v2's structured error shape. `account_id` scopes to one account; an entry with
 * neither `account_id` nor a per-account match (e.g. only `conn_id`, or neither) is
 * connection-level. `code` is `prefix.subcode` (e.g. `con.auth`) — consumers should key off
 * `code` only, never `msg` text, which carries no normative meaning per the protocol spec. */
interface SimpleFinError {
  code: string;
  msg: string;
  conn_id?: string;
  account_id?: string;
}

interface SimpleFinAccountsResponse {
  accounts: SimpleFinAccount[];
  errlist?: SimpleFinError[];
}

/**
 * Thrown when SimpleFIN reports the whole connection as unauthenticated (HTTP 403) rather than
 * a per-account error inside a 200 response. Distinct from a generic fetch failure so callers
 * can fan Needs Reauthentication onto every stored Account (ADR-0003) instead of surfacing a
 * transient operation error.
 */
export class SimpleFinAuthError extends Error {}

const AUTH_ERROR_CODES = new Set(['con.auth', 'gen.auth']);

/**
 * Classifies one account's sync status from the response's `errlist`. An entry with no
 * `account_id` is connection-level and applies to every account (Streams has one SimpleFIN
 * connection — ADR-0003), so it fans in here rather than needing a separate step.
 */
export function classifySyncStatus(accountId: string, errlist: SimpleFinError[]): AccountSyncStatus {
  const applicable = errlist.filter((e) => e.account_id === undefined || e.account_id === accountId);
  if (applicable.some((e) => AUTH_ERROR_CODES.has(e.code))) {
    return { kind: 'needs-reauth' };
  }
  if (applicable.length > 0) {
    return { kind: 'sync-issue', message: applicable[0].msg };
  }
  return { kind: 'ok' };
}

/**
 * How far back to request transaction history on every fetch. SimpleFIN's
 * `start-date` param is what actually scopes which transactions come back —
 * the protocol leaves the default (no `start-date`) implementation-defined,
 * and in practice bridges commonly return none at all without it.
 */
const TRANSACTION_LOOKBACK_DAYS = 90;

/**
 * SimpleFIN carries no asset/liability classifier, so a freshly synced account has no
 * `expectedSign` yet — that's user-set in the connect flow's sign-confirmation step. It
 * likewise knows nothing of Dry Floor, a Streams-only concept the user sets after connecting.
 */
export interface SyncedAccount {
  account: Omit<Account, 'expectedSign' | 'dryFloor'>;
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
    const startDate = Math.floor(Date.now() / 1000) - TRANSACTION_LOOKBACK_DAYS * 24 * 60 * 60;
    const response = await fetch(`${baseUrl}/accounts?start-date=${startDate}`, {
      headers: { Authorization: `Basic ${btoa(`${username}:${password}`)}` },
    });
    if (response.status === 403) {
      throw new SimpleFinAuthError('SimpleFIN connection needs reauthentication.');
    }
    if (!response.ok) {
      throw new Error(`SimpleFIN accounts fetch failed: ${response.status} ${response.statusText}`);
    }
    const data = (await response.json()) as SimpleFinAccountsResponse;
    const errlist = data.errlist ?? [];
    return data.accounts.map((raw) => toSyncedAccount(raw, errlist));
  }
}

function parseAccessUrl(accessUrl: string): {
  baseUrl: string;
  username: string;
  password: string;
} {
  const url = new URL(accessUrl);
  const username = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  url.username = '';
  url.password = '';
  return { baseUrl: url.toString().replace(/\/$/, ''), username, password };
}

function toSyncedAccount(raw: SimpleFinAccount, errlist: SimpleFinError[]): SyncedAccount {
  return {
    account: {
      id: raw.id,
      name: raw.name,
      institutionName: raw.org?.name ?? '',
      balance: Number(raw.balance),
      balanceDate: new Date(raw['balance-date'] * 1000),
      syncStatus: classifySyncStatus(raw.id, errlist),
    },
    transactions: raw.transactions.map((txn) => ({
      id: txn.id,
      accountId: raw.id,
      date: new Date(txn.posted * 1000),
      amount: Number(txn.amount),
      description: txn.description,
      matchedFlowId: null,
    })),
  };
}
