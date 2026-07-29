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
  /** Deprecated v1 field ("array of strings suitable for displaying to a user") that some
   * bridges still send instead of (or alongside) `errlist` — no `code`/scoping, so it's
   * connection-wide and normally only ever surfaces as a generic sync-issue. The one exception:
   * `fetchAccounts` synthesizes `LEGACY_AUTH_REQUIRED_CODE` for an entry matching
   * `LEGACY_AUTH_REQUIRED_PATTERN`, so that one narrow case can still trigger reauth
   * classification despite carrying no real `code`. */
  errors?: string[];
}

/**
 * Thrown when SimpleFIN reports the whole connection as unauthenticated (HTTP 403) rather than
 * a per-account error inside a 200 response. Distinct from a generic fetch failure so callers
 * can fan Needs Reauthentication onto every stored Account (ADR-0003) instead of surfacing a
 * transient operation error.
 */
export class SimpleFinAuthError extends Error {}

/** Streams-internal code, never sent by SimpleFIN Bridge itself — synthesized in `fetchAccounts`
 * for legacy code-less `errors[]` entries whose text matches `LEGACY_AUTH_REQUIRED_PATTERN`, so
 * `classifySyncStatus` can stay purely code-based. */
const LEGACY_AUTH_REQUIRED_CODE = 'legacy.auth-required';
const AUTH_ERROR_CODES = new Set(['con.auth', 'gen.auth', LEGACY_AUTH_REQUIRED_CODE]);

/** Narrow, case-insensitive match for the deprecated v1 `errors[]` field's only observed
 * auth-failure phrasing (CIBC's bridge). Deliberately not a broad `/auth/i` match — a legacy-only
 * bridge phrasing this differently still falls through to a generic sync-issue until that
 * phrasing is added, which is safer than false-triggering Reconnect on unrelated messages. */
const LEGACY_AUTH_REQUIRED_PATTERN = /auth required/i;

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
    return { kind: 'sync-issue', message: applicable.map((e) => e.msg).join('; ') };
  }
  return { kind: 'ok' };
}

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

  /**
   * `startDate`/`endDate` scope which transactions come back — the caller (`sync-window.ts`'s
   * normal-sync and backfill-chunk window computations) decides those, this stays a thin
   * protocol client. `endDate` is omitted from every normal sync (fetches through "now") and
   * only ever supplied for a bounded backfill chunk, so it stays optional here.
   */
  async fetchAccounts(accessUrl: string, startDate: Date, endDate?: Date): Promise<SyncedAccount[]> {
    const { baseUrl, username, password } = parseAccessUrl(accessUrl);
    const params = new URLSearchParams({
      'start-date': String(Math.floor(startDate.getTime() / 1000)),
    });
    if (endDate) {
      params.set('end-date', String(Math.floor(endDate.getTime() / 1000)));
    }
    const response = await fetch(`${baseUrl}/accounts?${params.toString()}`, {
      headers: { Authorization: `Basic ${btoa(`${username}:${password}`)}` },
    });
    if (response.status === 403) {
      throw new SimpleFinAuthError('SimpleFIN connection needs reauthentication.');
    }
    if (!response.ok) {
      throw new Error(`SimpleFIN accounts fetch failed: ${response.status} ${response.statusText}`);
    }
    const data = (await response.json()) as SimpleFinAccountsResponse;
    const legacyErrors: SimpleFinError[] = (data.errors ?? []).map((msg) => ({
      code: LEGACY_AUTH_REQUIRED_PATTERN.test(msg) ? LEGACY_AUTH_REQUIRED_CODE : '',
      msg,
    }));
    const errlist = [...(data.errlist ?? []), ...legacyErrors];
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
