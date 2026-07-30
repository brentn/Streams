import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  isDevMode,
  signal,
  viewChild,
} from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Account } from '../../core/models/account';
import { Flow } from '../../core/models/flow';
import { Transaction } from '../../core/models/transaction';
import { Transfer } from '../../core/models/transfer';
import {
  balanceAtDate,
  balanceSeries,
  runningDryAlert,
} from '../../core/projection/projection-engine';
import { BandPoint } from '../../core/charting/band-segments';
import {
  boundaryXFor,
  buildWindowDates,
  clampDayOffset,
  selectedDateFor,
  WINDOW_DAYS,
} from '../../core/charting/date-window';
import { bannerPresentation, derivedBannerState } from '../../core/sync/sync-presentation';
import { SyncCoordinator } from '../../core/sync/sync-coordinator';
import { openSimpleFinBridge } from '../../core/simplefin/reconnect';
import { StorageRepository } from '../../core/storage/storage-repository';
import { CalendarChip } from '../../shared/calendar-chip/calendar-chip';
import { DragScrub } from '../../shared/drag-scrub/drag-scrub.directive';
import { PrototypeSwitcher, PrototypeVariant } from '../../shared/prototype-switcher/prototype-switcher';
import { ResyncIcon } from '../../shared/resync-icon/resync-icon';
import { StatusBanner } from '../../shared/status-banner/status-banner';
import { StreamBand } from '../../shared/stream-band/stream-band';
import { FlowList } from './flow-list/flow-list';
import { TransactionReview } from './transaction-review/transaction-review';
import { TransferList } from './transfer-list/transfer-list';
import { buildPositionedTributaries, buildTributaries } from './tributary-prototype/tributary-data';
import { TributaryVariantA } from './tributary-prototype/tributary-variant-a';
import { TributaryVariantB } from './tributary-prototype/tributary-variant-b';
import { TributaryVariantC } from './tributary-prototype/tributary-variant-c';
import { TributaryVariantD } from './tributary-prototype/tributary-variant-d';
import { TributaryVariantE } from './tributary-prototype/tributary-variant-e';
import { TributaryVariantF } from './tributary-prototype/tributary-variant-f';

// PROTOTYPE — wayfinder ticket #52. TRIBUTARY_VARIANTS/prototypeVariant/setPrototypeVariant
// and the tributaries block below are throwaway; strip on capture (see ticket #52 resolution).
// A/B/C: even-spaced wedges/lists/bars, first pass. D/E/F: meandering curves positioned at
// the real occurrence date, per review feedback on the first pass (incoming from one
// direction, outgoing to the opposite, map-style angled labels via <textPath>).
const TRIBUTARY_VARIANTS: PrototypeVariant[] = [
  { key: 'a', label: 'Branch join' },
  { key: 'b', label: 'Peeled-off list' },
  { key: 'c', label: 'In/out bars' },
  { key: 'd', label: 'Corner-fan curves' },
  { key: 'e', label: 'Parallel-rail curves' },
  { key: 'f', label: 'Local squiggle curves' },
];

@Component({
  selector: 'app-account-stream',
  imports: [
    CurrencyPipe,
    DatePipe,
    RouterLink,
    DragScrub,
    CalendarChip,
    ResyncIcon,
    StatusBanner,
    StreamBand,
    FlowList,
    TransferList,
    TransactionReview,
    PrototypeSwitcher,
    TributaryVariantA,
    TributaryVariantB,
    TributaryVariantC,
    TributaryVariantD,
    TributaryVariantE,
    TributaryVariantF,
  ],
  templateUrl: './account-stream.html',
  styleUrl: './account-stream.css',
})
export class AccountStream {
  private readonly storage = inject(StorageRepository);
  private readonly syncCoordinator = inject(SyncCoordinator);
  private readonly router = inject(Router);

  readonly id = input.required<string>();
  /** PROTOTYPE (ticket #52) — bound from `?variant=` via `withComponentInputBinding()`. */
  readonly variant = input<string>();

  protected readonly prototypeEnabled = isDevMode();
  protected readonly tributaryVariants = TRIBUTARY_VARIANTS;
  protected readonly activeTributaryVariant = computed(() => this.variant() ?? 'a');
  protected readonly tributaries = computed(() =>
    buildTributaries(this.flows(), this.transfers(), this.id(), this.allAccounts()),
  );
  protected readonly positionedTributaries = computed(() =>
    buildPositionedTributaries(
      this.flows(),
      this.transfers(),
      this.id(),
      this.allAccounts(),
      this.selectedDate(),
    ),
  );

  protected setPrototypeVariant(key: string): void {
    void this.router.navigate([], { queryParams: { variant: key }, queryParamsHandling: 'merge' });
  }

  protected readonly windowDays = WINDOW_DAYS;

  protected readonly account = signal<Account | null>(null);
  protected readonly allAccounts = signal<Account[]>([]);
  protected readonly transactions = signal<Transaction[]>([]);
  protected readonly flows = signal<Flow[]>([]);
  protected readonly transfers = signal<Transfer[]>([]);
  protected readonly dayOffset = signal(0);
  protected readonly isSyncing = this.syncCoordinator.isSyncing;
  protected readonly operationError = this.syncCoordinator.operationError;
  protected readonly resyncLabel = computed(() => (this.isSyncing() ? 'Syncing…' : 'Re-sync'));

  /** Merges the transient operation-error with the loaded Account's persisted syncStatus — see `sync-presentation.ts`. */
  protected readonly bannerState = computed(() =>
    derivedBannerState(this.operationError(), this.account()?.syncStatus),
  );
  protected readonly banner = computed(() => bannerPresentation(this.bannerState()));

  protected readonly selectedDate = computed(() => selectedDateFor(this.dayOffset()));
  protected readonly isAtToday = computed(() => this.dayOffset() === 0);

  /** Catches focus when the Today button disappears out from under it on click. `read: ElementRef` because `#calendarChip` on a component tag otherwise resolves to the component instance, not its native element. */
  private readonly calendarChip = viewChild('calendarChip', { read: ElementRef<HTMLElement> });

  /** Recomputed from the current Account/Flow/Transfer/Transaction state, so it updates automatically as new Transactions sync in and the projection shifts. */
  protected readonly dryAlert = computed(() => {
    const account = this.account();
    if (!account) return null;
    return runningDryAlert(
      account,
      this.transactions(),
      this.flows(),
      this.transfers(),
      new Date(),
    );
  });

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

    // Reflects a sync that finished elsewhere — e.g. ADR-0004's app-open auto-resync,
    // already in flight by the time this view mounts — without the user taking any action.
    let wasSyncing = false;
    effect(() => {
      const syncing = this.isSyncing();
      if (wasSyncing && !syncing) {
        void this.load(this.id());
      }
      wasSyncing = syncing;
    });
  }

  protected async load(id: string): Promise<void> {
    const accounts = await this.storage.getAccounts();
    const found = accounts.find((a) => a.id === id) ?? null;
    // A record stored before the Dry Floor migration has no `dryFloor` yet — treat it as 0,
    // same default a freshly connected Account gets.
    const account = found ? { ...found, dryFloor: found.dryFloor ?? 0 } : null;
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

  protected jumpToToday(): void {
    this.dayOffset.set(0);
    this.calendarChip()?.nativeElement.focus();
  }

  protected async resync(): Promise<void> {
    await this.syncCoordinator.resync();
    await this.load(this.id());
  }

  /** The banner's action button follows whichever state is showing (see `bannerPresentation`) — Reauthorize additionally opens the SimpleFIN Bridge to re-link, but always resyncs: the connection's setup token stays valid through a bank-side re-link, so a plain resync is enough to clear needs-reauth once it's fixed there. */
  protected onBannerAction(): void {
    if (this.bannerState().kind === 'needs-reauth') {
      openSimpleFinBridge();
    }
    void this.resync();
  }
}
