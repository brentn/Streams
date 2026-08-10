import { effect, Injectable, signal } from '@angular/core';
import { openSimpleFinBridge } from '../simplefin/reconnect';
import { SimpleFinAdapter } from '../simplefin/simplefin-adapter';
import { StorageRepository } from '../storage/storage-repository';
import { resyncKnownAccounts } from './resync-known-accounts';

const AUTO_RESYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** ADR-0004: auto-resync at most once per day. Never synced before counts as due. */
export function isAutoResyncDue(lastSyncedAt: Date | undefined, now: Date): boolean {
  if (!lastSyncedAt) return true;
  return now.getTime() - lastSyncedAt.getTime() >= AUTO_RESYNC_INTERVAL_MS;
}

/**
 * Single source of sync state for `account-stream` and `multi-account-stream`, so both reflect
 * the same in-flight sync — whether triggered by the app-open auto-resync (ADR-0004), the
 * manual "Re-sync"/Reauthorize button, or this class's own return-to-tab retry below — rather
 * than tracking it independently as each did before.
 *
 * `operationError` is transient state for a failed sync *attempt* itself (network down, a
 * non-403 HTTP failure). It's distinct from the persisted per-Account `syncStatus` (Needs
 * Reauthentication / Sync Issue), which reflects the last successful fetch and is read
 * separately, then merged with this by priority — see `derivedBannerState`.
 */
@Injectable({ providedIn: 'root' })
export class SyncCoordinator {
  constructor(
    private readonly storage: StorageRepository,
    private readonly simplefin: SimpleFinAdapter,
  ) {}

  readonly isSyncing = signal(false);
  readonly operationError = signal<string | null>(null);

  /**
   * True from the moment Reauthorize opens the SimpleFIN Bridge until a resync observes every
   * Account clear of Needs Reauthentication. That first resync (fired in the same click, before
   * the user has done anything at the Bridge) is expected to still see the broken connection and
   * leave this true — `handleVisibilityChange` below is what actually closes the loop once the
   * user's fixed it there and returns to this tab.
   */
  readonly reauthPending = signal(false);

  private autoResyncChecked = false;

  /** Bound once so add/remove target the same listener reference — see `reauthorize`/`resync`. */
  private readonly handleVisibilityChange = (): void => {
    if (document.visibilityState === 'visible' && !this.isSyncing()) {
      void this.resync();
    }
  };

  /**
   * Called once from the app root on startup. A no-op if there's no stored SimpleFIN
   * connection, or if the daily throttle hasn't elapsed yet — the last-known persisted
   * `syncStatus` on each Account is what renders in that case, per ADR-0004.
   */
  async triggerAutoResyncIfDue(): Promise<void> {
    if (this.autoResyncChecked) return;
    this.autoResyncChecked = true;

    const accessUrl = await this.storage.getAccessUrl();
    if (!accessUrl) return;

    const lastSyncedAt = await this.storage.getLastSyncedAt();
    if (!isAutoResyncDue(lastSyncedAt, new Date())) return;

    await this.resync(false);
  }

  /**
   * The manual "Re-sync" button — always runs, bypassing the daily throttle. `allowBackfill`
   * defaults to true for that manual case; `triggerAutoResyncIfDue` passes false so unattended
   * daily auto-resync never chunks a dormant-gap backfill on its own (see
   * `resyncKnownAccounts`'s `allowBackfill` parameter).
   */
  async resync(allowBackfill = true): Promise<void> {
    this.isSyncing.set(true);
    this.operationError.set(null);
    try {
      await resyncKnownAccounts(this.storage, this.simplefin, allowBackfill);
      await this.storage.saveLastSyncedAt(new Date());
      if (this.reauthPending()) {
        const accounts = await this.storage.getAccounts();
        if (!accounts.some((account) => account.syncStatus?.kind === 'needs-reauth')) {
          this.reauthPending.set(false);
          document.removeEventListener('visibilitychange', this.handleVisibilityChange);
        }
      }
    } catch (err) {
      this.operationError.set(err instanceof Error ? err.message : 'Re-sync failed.');
    } finally {
      this.isSyncing.set(false);
    }
  }

  /**
   * The Reauthorize banner action: open the SimpleFIN Bridge for the user to re-link at, and
   * attempt a resync right away — almost always still needs-reauth at this point, since the user
   * hasn't done anything at the Bridge yet. Also starts listening for this tab becoming visible
   * again, so a resync automatically retries once the user's actually fixed it there and
   * returned, instead of silently requiring an unprompted second click (see issue #101).
   */
  async reauthorize(): Promise<void> {
    openSimpleFinBridge();
    this.reauthPending.set(true);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    await this.resync();
  }
}

/**
 * Reloads via `load` whenever a sync finishes anywhere — this view's own resync, the app-open
 * auto-resync, or `SyncCoordinator`'s own return-to-tab retry above — without the user having
 * taken any action in this particular view. Must be called from an injection context (a
 * component constructor).
 */
export function reloadOnSyncComplete(syncCoordinator: SyncCoordinator, load: () => void): void {
  let wasSyncing = false;
  effect(() => {
    const syncing = syncCoordinator.isSyncing();
    if (wasSyncing && !syncing) {
      load();
    }
    wasSyncing = syncing;
  });
}
