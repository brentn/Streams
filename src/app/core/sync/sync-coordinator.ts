import { Injectable, signal } from '@angular/core';
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
 * the same in-flight sync — whether triggered by the app-open auto-resync (ADR-0004) or the
 * manual "Re-sync" button, which bypasses the daily throttle — rather than tracking it
 * independently as each did before.
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

  private autoResyncChecked = false;

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
    } catch (err) {
      this.operationError.set(err instanceof Error ? err.message : 'Re-sync failed.');
    } finally {
      this.isSyncing.set(false);
    }
  }
}
