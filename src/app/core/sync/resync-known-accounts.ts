import { categorizeTransactions } from '../categorization/categorization';
import { SimpleFinAdapter, SimpleFinAuthError, SyncedAccount } from '../simplefin/simplefin-adapter';
import { StorageRepository } from '../storage/storage-repository';

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
 * A connection-wide auth failure (`SimpleFinAuthError`, from an HTTP 403) is caught here and
 * fanned onto every stored Account as Needs Reauthentication rather than rethrown — that's
 * persisted sync state for the UI to render, not a transient operation error.
 */
export async function resyncKnownAccounts(
  storage: StorageRepository,
  simplefin: SimpleFinAdapter,
): Promise<void> {
  const accessUrl = await storage.getAccessUrl();
  if (!accessUrl) {
    throw new Error('No SimpleFIN connection found.');
  }

  try {
    const synced = await simplefin.fetchAccounts(accessUrl);
    await reconcileSyncedAccounts(storage, synced);
  } catch (err) {
    if (err instanceof SimpleFinAuthError) {
      await markAllAccountsNeedsReauth(storage);
      return;
    }
    throw err;
  }
}
