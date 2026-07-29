import { categorizeTransactions } from '../categorization/categorization';
import { SimpleFinAdapter, SimpleFinAuthError, SyncedAccount } from '../simplefin/simplefin-adapter';
import { StorageRepository } from '../storage/storage-repository';
import { computeBackfillChunks, computeNormalSyncStartDate, initialBackfillCursor } from './sync-window';

export interface ReconcileResult {
  /** Accounts SimpleFIN returned with no local counterpart — still need the connect flow's sign-confirmation step, so they're handed back rather than persisted. */
  newAccounts: SyncedAccount[];
}

/**
 * Upserts every synced account that already has a local counterpart, preserving its previously
 * chosen `expectedSign` and `dryFloor` — SimpleFIN knows neither. Shared by resync (all synced
 * accounts are expected to be known) and the reauthentication flow (a mix of known accounts to
 * resync in place and genuinely new ones, returned as `newAccounts`, that still need sign
 * confirmation).
 *
 * Every synced Transaction is (re-)matched against the current Categorization Rules rather than
 * trusting a prior stored match — a manual correction always updates the matching rule (see
 * `TransactionReview`), so recomputing from the current rule set reproduces manual corrections
 * rather than clobbering them.
 */
export async function reconcileSyncedAccounts(
  storage: StorageRepository,
  synced: SyncedAccount[],
): Promise<ReconcileResult> {
  const existing = await storage.getAccounts();
  const rules = await storage.getCategorizationRules();
  const newAccounts: SyncedAccount[] = [];

  for (const item of synced) {
    const previous = existing.find((a) => a.id === item.account.id);
    if (!previous) {
      newAccounts.push(item);
      continue;
    }
    await storage.upsertAccount({
      ...item.account,
      expectedSign: previous.expectedSign,
      dryFloor: previous.dryFloor,
    });
    await storage.upsertTransactions(categorizeTransactions(item.transactions, rules));
  }

  return { newAccounts };
}

export interface NormalSyncResult {
  synced: SyncedAccount[];
  /** The backfill cursor as of this call — freshly bootstrapped if this connection never had one. */
  cursor: Date;
}

/** Bootstraps the backfill cursor (`getOldestFetchedAt`) the first time it's ever read for a connection: an existing connection predating this cursor, and a brand-new one, both realistically have no more than `MAX_SYNC_LOOKBACK_DAYS` of history fetched so far (the old code's rolling window never accumulated more), so both bootstrap to the same ~85-day-ago estimate. */
async function bootstrapCursorIfNeeded(storage: StorageRepository, now: Date): Promise<Date> {
  const cursor = await storage.getOldestFetchedAt();
  if (cursor) return cursor;

  const bootstrapped = initialBackfillCursor(now);
  await storage.saveOldestFetchedAt(bootstrapped);
  return bootstrapped;
}

/**
 * Fetches the single "normal" sync window — shared by first-time/reauth linking
 * (`connect-account.ts`) and every resync trigger (auto and manual alike).
 */
export async function fetchNormalSyncWindow(
  storage: StorageRepository,
  simplefin: SimpleFinAdapter,
  accessUrl: string,
): Promise<NormalSyncResult> {
  const now = new Date();
  const [lastSyncedAt, cursor] = await Promise.all([
    storage.getLastSyncedAt(),
    bootstrapCursorIfNeeded(storage, now),
  ]);
  const synced = await simplefin.fetchAccounts(accessUrl, computeNormalSyncStartDate(lastSyncedAt, now));

  return { synced, cursor };
}

/**
 * Walks the backfill cursor further into the past, one chunk at a time, persisting it after
 * each chunk succeeds — so a chunk failure partway through still keeps the progress made by the
 * chunks before it (see `computeBackfillChunks`'s resumability contract).
 */
async function runDormantGapBackfill(
  storage: StorageRepository,
  simplefin: SimpleFinAdapter,
  accessUrl: string,
  cursor: Date,
): Promise<void> {
  for (const chunk of computeBackfillChunks(cursor, new Date())) {
    const synced = await simplefin.fetchAccounts(accessUrl, chunk.startDate, chunk.endDate);
    await reconcileSyncedAccounts(storage, synced);
    await storage.saveOldestFetchedAt(chunk.startDate);
  }
}

/** Streams has one SimpleFIN connection (ADR-0003), so an HTTP 403 on the accounts fetch means every stored Account is affected at once. */
async function markAllAccountsNeedsReauth(storage: StorageRepository): Promise<void> {
  const accounts = await storage.getAccounts();
  await Promise.all(
    accounts.map((account) =>
      storage.upsertAccount({ ...account, syncStatus: { kind: 'needs-reauth' } }),
    ),
  );
}

/**
 * Re-syncs every already-confirmed account from SimpleFIN. Shared by `account-stream` and the
 * multi-account view — resync only refreshes accounts the user has already been through the
 * connect flow's sign-confirmation step for; an account SimpleFIN returns that isn't stored
 * locally is skipped, since there's no flow here to confirm its sign.
 *
 * `allowBackfill` gates whether a dormant-gap backfill may run after the normal sync window.
 * Manual "Re-sync" (the default) allows it; unattended daily auto-resync
 * (`SyncCoordinator.triggerAutoResyncIfDue`) passes false so it never chunks on its own, since
 * each chunk is another request against SimpleFIN Bridge's ~24/day quota (ADR-0004).
 *
 * A connection-wide auth failure (`SimpleFinAuthError`, from an HTTP 403) is caught here and
 * fanned onto every stored Account as Needs Reauthentication rather than rethrown — that's
 * persisted sync state for the UI to render, not a transient operation error. It short-circuits
 * before backfill runs, since a broken connection can't fetch anything else either.
 */
export async function resyncKnownAccounts(
  storage: StorageRepository,
  simplefin: SimpleFinAdapter,
  allowBackfill = true,
): Promise<void> {
  const accessUrl = await storage.getAccessUrl();
  if (!accessUrl) {
    throw new Error('No SimpleFIN connection found.');
  }

  try {
    const { synced, cursor } = await fetchNormalSyncWindow(storage, simplefin, accessUrl);
    await reconcileSyncedAccounts(storage, synced);

    if (allowBackfill) {
      await runDormantGapBackfill(storage, simplefin, accessUrl, cursor);
    }
  } catch (err) {
    if (err instanceof SimpleFinAuthError) {
      await markAllAccountsNeedsReauth(storage);
      return;
    }
    throw err;
  }
}
