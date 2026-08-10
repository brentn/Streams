import { categorizeTransactions } from '../categorization/categorization';
import { SimpleFinAdapter, SimpleFinAuthError, SyncedAccount } from '../simplefin/simplefin-adapter';
import { StorageRepository } from '../storage/storage-repository';
import { computeBackfillChunks, computeNormalSyncStartDate, hasDormantGap, initialBackfillCursor } from './sync-window';

export interface ReconcileResult {
  /** Accounts SimpleFIN returned with no local counterpart — still need the connect flow's sign-confirmation step, so they're handed back rather than persisted. */
  newAccounts: SyncedAccount[];
}

/**
 * Upserts every synced account that already has a local counterpart, preserving fields the app
 * treats as locally owned once an account is known — `expectedSign` and `dryFloor` (SimpleFIN
 * knows neither), plus `name` and `institutionName` (SimpleFIN's values seed them only at
 * first-confirmation time, in the connect flow; after that a resync must never clobber a local
 * rename). Shared by resync (all synced accounts are expected to be known) and the
 * reauthentication flow (a mix of known accounts to resync in place and genuinely new ones,
 * returned as `newAccounts`, that still need sign confirmation).
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
      name: previous.name,
      institutionName: previous.institutionName,
      expectedSign: previous.expectedSign,
      dryFloor: previous.dryFloor,
    });
    await storage.upsertTransactions(categorizeTransactions(item.transactions, rules));
  }

  return { newAccounts };
}

/**
 * Recovers accounts SimpleFIN reports under a new `id` that `reconcileSyncedAccounts` couldn't
 * match — `id` isn't durable across a bank-side relink even when the connection's Access URL
 * stays valid (issue #102's investigation: a fully-reauthorized connection can still hand back a
 * clean, error-free response for an account under an id Streams has never seen). Matches on exact
 * `name` **and** `institutionName` equality against Accounts still marked Needs Reauthentication
 * — both required, since the candidate pool during recovery is the user's entire account list
 * (ADR-0003's connection-wide fan-out), not a narrow subset, so `name` alone risks a false-
 * positive merge between two differently-institutioned accounts that happen to share a generic
 * name. Re-keys only when exactly one candidate matches, and removes it from the pool immediately
 * after, so a second orphaned account in the same resync can't also claim it. Deliberately narrow
 * (only ever runs during reauth recovery, never an ordinary resync) and conservative (an empty or
 * ambiguous match falls through to `orphaned`, i.e. today's existing "new account" treatment,
 * untouched, rather than risking a wrong merge).
 */
export async function reconcileOrphanedAccounts(
  storage: StorageRepository,
  orphaned: SyncedAccount[],
): Promise<void> {
  if (orphaned.length === 0) return;

  const needsReauthAccounts = (await storage.getAccounts()).filter(
    (account) => account.syncStatus?.kind === 'needs-reauth',
  );
  const rules = await storage.getCategorizationRules();

  for (const item of orphaned) {
    const candidates = needsReauthAccounts.filter(
      (account) =>
        account.name === item.account.name && account.institutionName === item.account.institutionName,
    );
    if (candidates.length !== 1) continue;
    const [previous] = candidates;
    needsReauthAccounts.splice(needsReauthAccounts.indexOf(previous), 1);

    await storage.reidAccount(previous.id, {
      ...item.account,
      name: previous.name,
      institutionName: previous.institutionName,
      expectedSign: previous.expectedSign,
      dryFloor: previous.dryFloor,
    });
    await storage.upsertTransactions(categorizeTransactions(item.transactions, rules));
  }
}

export interface NormalSyncResult {
  synced: SyncedAccount[];
  /** The backfill cursor as of this call — freshly bootstrapped if this connection never had one. */
  cursor: Date;
  /** Where this call's normal sync itself started — the near edge of any Dormant Gap. */
  normalSyncStartDate: Date;
  /** Captured once so every date computed from "now" in this sync agrees, even across awaits. */
  now: Date;
}

/** Bootstraps the backfill cursor (`getOldestFetchedAt`) the first time it's ever read for a connection: an existing connection predating this cursor, and a brand-new one, both realistically have no more than `MAX_SYNC_LOOKBACK_DAYS` of history fetched so far (the old code's rolling window never accumulated more), so both bootstrap to the same ~40-day-ago estimate. */
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
 *
 * `recoveringFromNeedsReauth` forces the Sync Floor as this call's start date regardless of
 * what's stored — used when this resync is recovering from Needs Reauthentication, where a
 * stored `lastSyncedAt` may look recent (a failed attempt during the outage still bumped it)
 * without reflecting any actual successful sync (ADR-0013).
 */
export async function fetchNormalSyncWindow(
  storage: StorageRepository,
  simplefin: SimpleFinAdapter,
  accessUrl: string,
  recoveringFromNeedsReauth = false,
): Promise<NormalSyncResult> {
  const now = new Date();
  const [lastSyncedAt, cursor] = await Promise.all([
    storage.getLastSyncedAt(),
    bootstrapCursorIfNeeded(storage, now),
  ]);
  const normalSyncStartDate = computeNormalSyncStartDate(
    recoveringFromNeedsReauth ? undefined : lastSyncedAt,
    now,
  );
  const synced = await simplefin.fetchAccounts(accessUrl, normalSyncStartDate);

  return { synced, cursor, normalSyncStartDate, now };
}

/**
 * Closes a Dormant Gap — the span between `cursor` (where continuous coverage already existed)
 * and `normalSyncStartDate` (the near edge, where this resync's normal sync itself picks back
 * up) — one 40-day chunk at a time, walking forward from `cursor` and persisting each chunk's
 * `endDate` as the new cursor as it succeeds, so a chunk failure partway through still keeps the
 * progress made by the chunks before it, and a gap too wide for one resync's cap keeps closing
 * further on every subsequent manual resync rather than restarting. Two cases never spend a
 * request: `cursor` already at or past `normalSyncStartDate` (no gap at all), and this being an
 * unattended auto-resync (`allowBackfill` false) — a real gap is left for a future manual resync
 * to close instead, protecting SimpleFIN Bridge's request quota (ADR-0004).
 *
 * Whenever there's no gap left to close after this call — either there never was one, or these
 * chunks just closed it — the cursor is re-anchored forward to `now`. Without this, a cursor
 * that's merely old (because nothing has needed to move it, not because the connection went
 * dormant) looks identical to a genuine gap once enough wall-clock time passes, which is what let
 * a healthy connection's cursor drift into recomputing a "gap" against it on every resync
 * (ADR-0013). Re-anchoring costs nothing extra — it never fetches — so it runs even when
 * `allowBackfill` is false; only spending a request on an unclosed gap is gated by it.
 *
 * `recoveringFromNeedsReauth` forces the same "no gap" treatment regardless of `cursor` — a
 * connection recovering from an outage has no continuous prior coverage to backfill toward
 * (ADR-0013), so whatever span the cursor implies is discarded rather than chunk-backfilled.
 */
async function reconcileBackfillCursor(
  storage: StorageRepository,
  simplefin: SimpleFinAdapter,
  accessUrl: string,
  { cursor, normalSyncStartDate, now }: NormalSyncResult,
  allowBackfill: boolean,
  recoveringFromNeedsReauth: boolean,
): Promise<void> {
  if (recoveringFromNeedsReauth || !hasDormantGap(cursor, normalSyncStartDate)) {
    await storage.saveOldestFetchedAt(now);
    return;
  }
  if (!allowBackfill) return;

  const chunks = computeBackfillChunks(cursor, normalSyncStartDate);
  for (const chunk of chunks) {
    const synced = await simplefin.fetchAccounts(accessUrl, chunk.startDate, chunk.endDate);
    await reconcileSyncedAccounts(storage, synced);
    await storage.saveOldestFetchedAt(chunk.endDate);
  }

  const lastChunk = chunks[chunks.length - 1];
  const gapFullyClosed =
    lastChunk !== undefined && lastChunk.endDate.getTime() === normalSyncStartDate.getTime();
  if (gapFullyClosed) {
    await storage.saveOldestFetchedAt(now);
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
 * Whether this connection itself — not just one Account on it — was left in Needs
 * Reauthentication by a prior sync attempt, read before this attempt runs so a stale-but-not-yet-
 * cleared status still counts even if this attempt goes on to succeed. Requires every stored
 * Account to share the status, matching `markAllAccountsNeedsReauth`'s connection-wide fan-out
 * (ADR-0003) — a single Account can also land in Needs Reauthentication from its own per-account
 * SimpleFIN error (`classifySyncStatus`) while the rest of the connection stays healthy, and that
 * case must not force every other, unrelated Account's resync onto the Sync Floor.
 */
async function isRecoveringFromNeedsReauth(storage: StorageRepository): Promise<boolean> {
  const accounts = await storage.getAccounts();
  return accounts.length > 0 && accounts.every((account) => account.syncStatus?.kind === 'needs-reauth');
}

/**
 * Re-syncs every already-confirmed account from SimpleFIN. Shared by `account-stream` and the
 * multi-account view — resync only refreshes accounts the user has already been through the
 * connect flow's sign-confirmation step for; an account SimpleFIN returns that isn't stored
 * locally is skipped, since there's no flow here to confirm its sign.
 *
 * `allowBackfill` gates whether a Dormant Gap backfill may spend requests closing a real gap
 * after the normal sync window. Manual "Re-sync" (the default) allows it; unattended daily
 * auto-resync (`SyncCoordinator.triggerAutoResyncIfDue`) passes false so it never chunks on its
 * own, since each chunk is another request against SimpleFIN Bridge's ~24/day quota (ADR-0004).
 * It does not gate re-anchoring the cursor when there's no gap to begin with — see
 * `reconcileBackfillCursor`.
 *
 * When this connection was left in Needs Reauthentication by a prior attempt, this resync is
 * recovering from that outage — per ADR-0013 it has no continuous prior coverage to backfill
 * toward, same as a brand-new account, so it forces the normal sync's own start date to the Sync
 * Floor (bypassing `lastSyncedAt`, which a failed attempt during the outage may have already
 * bumped without ever reflecting a real sync) and treats the outage as no gap at all rather than
 * one to chunk-backfill, re-anchoring the cursor to now on success.
 *
 * A connection-wide auth failure (`SimpleFinAuthError`, from an HTTP 403) is caught here and
 * fanned onto every stored Account as Needs Reauthentication rather than rethrown — that's
 * persisted sync state for the UI to render, not a transient operation error. It short-circuits
 * before backfill runs, since a broken connection can't fetch anything else either.
 *
 * While recovering from Needs Reauthentication specifically, anything `reconcileSyncedAccounts`
 * couldn't match by id is given a second chance via `reconcileOrphanedAccounts` (SimpleFIN can
 * hand back a new id for an account across a relink even though the connection stays valid — see
 * that function's doc) before falling back to the ordinary "unmatched, so skipped" treatment.
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

  const recoveringFromNeedsReauth = await isRecoveringFromNeedsReauth(storage);

  try {
    const normalSync = await fetchNormalSyncWindow(
      storage,
      simplefin,
      accessUrl,
      recoveringFromNeedsReauth,
    );
    const { newAccounts } = await reconcileSyncedAccounts(storage, normalSync.synced);
    if (recoveringFromNeedsReauth) {
      await reconcileOrphanedAccounts(storage, newAccounts);
    }
    await reconcileBackfillCursor(
      storage,
      simplefin,
      accessUrl,
      normalSync,
      allowBackfill,
      recoveringFromNeedsReauth,
    );
  } catch (err) {
    if (err instanceof SimpleFinAuthError) {
      await markAllAccountsNeedsReauth(storage);
      return;
    }
    throw err;
  }
}
