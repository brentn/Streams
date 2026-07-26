import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { Account } from '../../core/models/account';
import { Transaction } from '../../core/models/transaction';
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
import { resyncKnownAccounts } from '../../core/sync/resync-known-accounts';
import { SimpleFinAdapter } from '../../core/simplefin/simplefin-adapter';
import { StorageRepository } from '../../core/storage/storage-repository';
import { CalendarChip } from '../../shared/calendar-chip/calendar-chip';
import { DragScrub } from '../../shared/drag-scrub/drag-scrub.directive';
import { StatusBanner } from '../../shared/status-banner/status-banner';
import { StreamBand } from '../../shared/stream-band/stream-band';

interface AccountLane {
  account: Account;
  points: BandPoint[];
  maxAbsBalance: number;
  boundaryX: number;
  balance: number;
  isOpposite: boolean;
}

@Component({
  selector: 'app-multi-account-stream',
  imports: [CurrencyPipe, DragScrub, CalendarChip, StatusBanner, StreamBand],
  templateUrl: './multi-account-stream.html',
  styleUrl: './multi-account-stream.css',
})
export class MultiAccountStream {
  private readonly storage = inject(StorageRepository);
  private readonly simplefin = inject(SimpleFinAdapter);

  protected readonly windowDays = WINDOW_DAYS;

  private readonly accounts = signal<Account[]>([]);
  private readonly transactionsByAccount = signal<Map<string, Transaction[]>>(new Map());
  protected readonly dayOffset = signal(0);
  protected readonly isSyncing = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly selectedDate = computed(() => selectedDateFor(this.dayOffset()));

  private readonly windowDates = computed(() => buildWindowDates(this.selectedDate()));

  protected readonly lanes = computed<AccountLane[]>(() => {
    const transactionsByAccount = this.transactionsByAccount();
    const dates = this.windowDates();
    const selectedDate = this.selectedDate();

    return this.accounts().map((account) => {
      const transactions = transactionsByAccount.get(account.id) ?? [];
      const series = balanceSeries(account, transactions, dates);
      const points = series.map((p, i) => ({ x: i, balance: p.balance }));
      const balance = balanceAtDate(account, transactions, selectedDate);
      return {
        account,
        points,
        maxAbsBalance: points.reduce((max, p) => Math.max(max, Math.abs(p.balance)), 0),
        boundaryX: boundaryXFor(account.balanceDate, selectedDate),
        balance,
        isOpposite: balance * account.expectedSign < 0,
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
    const entries = await Promise.all(
      accounts.map(async (a): Promise<[string, Transaction[]]> => [
        a.id,
        await this.storage.getTransactionsForAccount(a.id),
      ]),
    );
    this.transactionsByAccount.set(new Map(entries));
  }

  protected shiftDay(delta: number): void {
    this.dayOffset.update((offset) => clampDayOffset(offset + delta));
  }

  protected async resync(): Promise<void> {
    this.isSyncing.set(true);
    this.errorMessage.set(null);
    try {
      await resyncKnownAccounts(this.storage, this.simplefin);
      await this.load();
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Re-sync failed.');
    } finally {
      this.isSyncing.set(false);
    }
  }
}
