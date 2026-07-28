import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
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
import { resyncKnownAccounts } from '../../core/sync/resync-known-accounts';
import { SimpleFinAdapter } from '../../core/simplefin/simplefin-adapter';
import { StorageRepository } from '../../core/storage/storage-repository';
import { CalendarChip } from '../../shared/calendar-chip/calendar-chip';
import { DragScrub } from '../../shared/drag-scrub/drag-scrub.directive';
import { StatusBanner } from '../../shared/status-banner/status-banner';
import { StreamBand } from '../../shared/stream-band/stream-band';
import { FlowList } from './flow-list/flow-list';
import { TransactionReview } from './transaction-review/transaction-review';
import { TransferList } from './transfer-list/transfer-list';

@Component({
  selector: 'app-account-stream',
  imports: [
    CurrencyPipe,
    RouterLink,
    DragScrub,
    CalendarChip,
    StatusBanner,
    StreamBand,
    FlowList,
    TransferList,
    TransactionReview,
  ],
  templateUrl: './account-stream.html',
  styleUrl: './account-stream.css',
})
export class AccountStream {
  private readonly storage = inject(StorageRepository);
  private readonly simplefin = inject(SimpleFinAdapter);

  readonly id = input.required<string>();

  protected readonly windowDays = WINDOW_DAYS;

  protected readonly account = signal<Account | null>(null);
  protected readonly allAccounts = signal<Account[]>([]);
  protected readonly transactions = signal<Transaction[]>([]);
  protected readonly flows = signal<Flow[]>([]);
  protected readonly transfers = signal<Transfer[]>([]);
  protected readonly dayOffset = signal(0);
  protected readonly isSyncing = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly selectedDate = computed(() => selectedDateFor(this.dayOffset()));

  protected readonly balance = computed(() => {
    const account = this.account();
    return account
      ? balanceAtDate(
          account,
          this.transactions(),
          this.selectedDate(),
          this.flows(),
          this.transfers(),
        )
      : null;
  });

  protected readonly isActual = computed(() => {
    const account = this.account();
    return account ? this.selectedDate().getTime() <= account.balanceDate.getTime() : false;
  });

  protected readonly isOppositeSign = computed(() => {
    const account = this.account();
    const balance = this.balance();
    return account !== null && balance !== null && balance * account.expectedSign < 0;
  });

  private readonly windowDates = computed(() => buildWindowDates(this.selectedDate()));

  protected readonly points = computed<BandPoint[]>(() => {
    const account = this.account();
    if (!account) return [];
    return balanceSeries(
      account,
      this.transactions(),
      this.windowDates(),
      this.flows(),
      this.transfers(),
    ).map((p, i) => ({ x: i, balance: p.balance }));
  });

  protected readonly maxAbsBalance = computed(() =>
    this.points().reduce((max, p) => Math.max(max, Math.abs(p.balance)), 0),
  );

  protected readonly boundaryX = computed(() => {
    const account = this.account();
    return account ? boundaryXFor(account.balanceDate, this.selectedDate()) : 0;
  });

  constructor() {
    effect(() => {
      void this.load(this.id());
    });
  }

  protected async load(id: string): Promise<void> {
    const accounts = await this.storage.getAccounts();
    const account = accounts.find((a) => a.id === id) ?? null;
    this.account.set(account);
    this.allAccounts.set(accounts);
    this.transactions.set(account ? await this.storage.getTransactionsForAccount(id) : []);
    this.flows.set(account ? await this.storage.getFlowsForAccount(id) : []);
    this.transfers.set(account ? await this.storage.getTransfersForAccount(id) : []);
  }

  protected async reloadFlows(): Promise<void> {
    this.flows.set(await this.storage.getFlowsForAccount(this.id()));
  }

  protected async reloadTransfers(): Promise<void> {
    this.transfers.set(await this.storage.getTransfersForAccount(this.id()));
  }

  protected async reloadTransactions(): Promise<void> {
    this.transactions.set(await this.storage.getTransactionsForAccount(this.id()));
  }

  /** A Transaction assignment can also create a Flow inline (AssignFlowDialog), so reload both. */
  protected async reloadAll(): Promise<void> {
    await Promise.all([this.reloadFlows(), this.reloadTransactions()]);
  }

  protected shiftDay(delta: number): void {
    this.dayOffset.update((offset) => clampDayOffset(offset + delta));
  }

  protected async resync(): Promise<void> {
    this.isSyncing.set(true);
    this.errorMessage.set(null);
    try {
      await resyncKnownAccounts(this.storage, this.simplefin);
      await this.load(this.id());
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Re-sync failed.');
    } finally {
      this.isSyncing.set(false);
    }
  }
}
