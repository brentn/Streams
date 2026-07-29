import { Component, computed, DestroyRef, effect, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Account } from '../../core/models/account';
import { Flow } from '../../core/models/flow';
import { Transaction } from '../../core/models/transaction';
import { Transfer } from '../../core/models/transfer';
import { balanceAtDate, balanceSeries } from '../../core/projection/projection-engine';
import { BandPoint } from '../../core/charting/band-segments';
import {
  boundaryXFor,
  buildWindowDates,
  clampDayOffset,
  selectedDateFor,
  WINDOW_DAYS,
} from '../../core/charting/date-window';
import { laneHeightsFor, NARROW_BREAKPOINT_PX } from '../../core/charting/lane-heights';
import { bannerPresentation, connectionBannerState } from '../../core/sync/sync-presentation';
import { SyncCoordinator } from '../../core/sync/sync-coordinator';
import { openSimpleFinBridge } from '../../core/simplefin/reconnect';
import { StorageRepository } from '../../core/storage/storage-repository';
import { CalendarChip } from '../../shared/calendar-chip/calendar-chip';
import { DragScrub } from '../../shared/drag-scrub/drag-scrub.directive';
import { StatusBanner } from '../../shared/status-banner/status-banner';
import { StreamBand } from '../../shared/stream-band/stream-band';
import { SyncBadge } from '../../shared/sync-badge/sync-badge';

interface AccountLane {
  account: Account;
  points: BandPoint[];
  maxAbsBalance: number;
  boundaryX: number;
  balance: number;
  isOpposite: boolean;
  /** Only set when this account has a Sync Issue and the connection-level banner isn't already showing something higher-priority — no indicator for a suppressed lower-priority state. */
  syncIssueMessage: string | null;
}

@Component({
  selector: 'app-multi-account-stream',
  imports: [CurrencyPipe, RouterLink, DragScrub, CalendarChip, StatusBanner, StreamBand, SyncBadge],
  templateUrl: './multi-account-stream.html',
  styleUrl: './multi-account-stream.css',
})
export class MultiAccountStream {
  private readonly storage = inject(StorageRepository);
  private readonly syncCoordinator = inject(SyncCoordinator);
  private readonly router = inject(Router);

  protected readonly windowDays = WINDOW_DAYS;

  private readonly accounts = signal<Account[]>([]);
  private readonly transactionsByAccount = signal<Map<string, Transaction[]>>(new Map());
  private readonly flowsByAccount = signal<Map<string, Flow[]>>(new Map());
  private readonly transfersByAccount = signal<Map<string, Transfer[]>>(new Map());
  protected readonly dayOffset = signal(0);
  protected readonly isSyncing = this.syncCoordinator.isSyncing;
  protected readonly operationError = this.syncCoordinator.operationError;

  /** Fanned (not per-lane) — see `connectionBannerState`. */
  protected readonly bannerState = computed(() =>
    connectionBannerState(this.operationError(), this.accounts()),
  );
  protected readonly banner = computed(() => bannerPresentation(this.bannerState()));

  protected readonly selectedDate = computed(() => selectedDateFor(this.dayOffset()));

  private readonly windowDates = computed(() => buildWindowDates(this.selectedDate()));

  protected readonly lanes = computed<AccountLane[]>(() => {
    const transactionsByAccount = this.transactionsByAccount();
    const flowsByAccount = this.flowsByAccount();
    const transfersByAccount = this.transfersByAccount();
    const dates = this.windowDates();
    const selectedDate = this.selectedDate();
    // The connection-level banner already covers needs-reauth/operation-error — a lane badge
    // for Sync Issue on top of that would be a second indicator for a suppressed state.
    const showSyncBadges = this.bannerState().kind === 'ok';

    return this.accounts().map((account) => {
      const transactions = transactionsByAccount.get(account.id) ?? [];
      const flows = flowsByAccount.get(account.id) ?? [];
      const transfers = transfersByAccount.get(account.id) ?? [];
      const series = balanceSeries(account, transactions, dates, flows, transfers);
      const points = series.map((p, i) => ({ x: i, balance: p.balance }));
      const balance = balanceAtDate(account, transactions, selectedDate, flows, transfers);
      const syncStatus = account.syncStatus;
      return {
        account,
        points,
        maxAbsBalance: points.reduce((max, p) => Math.max(max, Math.abs(p.balance)), 0),
        boundaryX: boundaryXFor(account.balanceDate, selectedDate),
        balance,
        isOpposite: balance * account.expectedSign < 0,
        syncIssueMessage:
          showSyncBadges && syncStatus?.kind === 'sync-issue' ? syncStatus.message : null,
      };
    });
  });

  protected readonly totalPoints = computed<BandPoint[]>(() => {
    const lanes = this.lanes();
    if (lanes.length === 0) return [];
    return lanes[0].points.map((_, i) => ({
      x: i,
      balance: lanes.reduce((sum, lane) => sum + lane.points[i].balance, 0),
    }));
  });

  protected readonly totalMaxAbsBalance = computed(() =>
    this.totalPoints().reduce((max, p) => Math.max(max, Math.abs(p.balance)), 0),
  );

  /** Actual only where every constituent account is still actual — the earliest balanceDate. */
  protected readonly totalBoundaryX = computed(() => {
    const lanes = this.lanes();
    if (lanes.length === 0) return 0;
    const earliestBalanceDate = lanes.reduce(
      (earliest, lane) => (lane.account.balanceDate < earliest ? lane.account.balanceDate : earliest),
      lanes[0].account.balanceDate,
    );
    return boundaryXFor(earliestBalanceDate, this.selectedDate());
  });

  protected readonly totalBalance = computed(() =>
    this.lanes().reduce((sum, lane) => sum + lane.balance, 0),
  );

  protected readonly totalIsOpposite = computed(() => this.totalBalance() < 0);

  private readonly isNarrow = signal(
    typeof matchMedia === 'function' && matchMedia(`(max-width: ${NARROW_BREAKPOINT_PX}px)`).matches,
  );
  protected readonly totalLaneHeight = computed(() => laneHeightsFor(this.isNarrow()).total);
  protected readonly accountLaneHeight = computed(() => laneHeightsFor(this.isNarrow()).account);

  constructor() {
    void this.load();

    // Reflects a sync that finished elsewhere — e.g. ADR-0004's app-open auto-resync,
    // already in flight by the time this view mounts — without the user taking any action.
    let wasSyncing = false;
    effect(() => {
      const syncing = this.isSyncing();
      if (wasSyncing && !syncing) {
        void this.load();
      }
      wasSyncing = syncing;
    });

    if (typeof matchMedia === 'function') {
      const query = matchMedia(`(max-width: ${NARROW_BREAKPOINT_PX}px)`);
      const listener = (event: MediaQueryListEvent) => this.isNarrow.set(event.matches);
      query.addEventListener('change', listener);
      inject(DestroyRef).onDestroy(() => query.removeEventListener('change', listener));
    }
  }

  protected async load(): Promise<void> {
    const accounts = await this.storage.getAccounts();
    this.accounts.set(accounts);
    const transactionEntries = await Promise.all(
      accounts.map(async (a): Promise<[string, Transaction[]]> => [
        a.id,
        await this.storage.getTransactionsForAccount(a.id),
      ]),
    );
    this.transactionsByAccount.set(new Map(transactionEntries));
    const flowEntries = await Promise.all(
      accounts.map(async (a): Promise<[string, Flow[]]> => [
        a.id,
        await this.storage.getFlowsForAccount(a.id),
      ]),
    );
    this.flowsByAccount.set(new Map(flowEntries));
    const transferEntries = await Promise.all(
      accounts.map(async (a): Promise<[string, Transfer[]]> => [
        a.id,
        await this.storage.getTransfersForAccount(a.id),
      ]),
    );
    this.transfersByAccount.set(new Map(transferEntries));
  }

  protected shiftDay(delta: number): void {
    this.dayOffset.update((offset) => clampDayOffset(offset + delta));
  }

  protected onLaneTap(target: HTMLElement): void {
    const accountId = target.closest<HTMLElement>('[data-account-id]')?.dataset['accountId'];
    if (accountId) void this.router.navigateByUrl(`/accounts/${accountId}`);
  }

  protected async resync(): Promise<void> {
    await this.syncCoordinator.resync();
    await this.load();
  }

  /** The banner's action button follows whichever state is showing (see `bannerPresentation`) — Reauthorize additionally opens the SimpleFIN Bridge to re-link, but always resyncs: the connection's setup token stays valid through a bank-side re-link, so a plain resync is enough to clear needs-reauth once it's fixed there. */
  protected onBannerAction(): void {
    if (this.bannerState().kind === 'needs-reauth') {
      openSimpleFinBridge();
    }
    void this.resync();
  }
}
