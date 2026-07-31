import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { Dialog } from '@angular/cdk/dialog';
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
import { buildTributaries, buildUncategorizedTributaries, Tributary } from '../../core/charting/tributaries';
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
import { FlowFormDialog } from './flow-form-dialog/flow-form-dialog';
import { TransferFormDialog } from './transfer-form-dialog/transfer-form-dialog';
import { TransactionReview } from './transaction-review/transaction-review';
import { TributaryPanel } from './tributary-panel/tributary-panel';

@Component({
  selector: 'app-account-stream',
  imports: [
    CurrencyPipe,
    DatePipe,
    RouterLink,
    DragScrub,
    CalendarChip,
    PrototypeSwitcher,
    ResyncIcon,
    StatusBanner,
    StreamBand,
    TransactionReview,
    TributaryPanel,
  ],
  templateUrl: './account-stream.html',
  styleUrl: './account-stream.css',
})
export class AccountStream {
  private readonly storage = inject(StorageRepository);
  private readonly syncCoordinator = inject(SyncCoordinator);
  private readonly dialog = inject(Dialog);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly id = input.required<string>();

  /**
   * PROTOTYPE (see `stream-band.ts`'s `encoding` input) — three ways of showing `|balance|`,
   * switchable via `?variant=` so it's shareable/reload-stable: `A` is the shipped width-encoded
   * ribbon; `B`/`C` hold width constant and encode balance as color instead. Delete this, the
   * `<app-prototype-switcher>` below, and the non-`width` `StreamBand` encodings together once a
   * variant wins or loses.
   */
  protected readonly variants: PrototypeVariant[] = [
    { key: 'A', label: 'Width (current)' },
    { key: 'B', label: 'Constant width, color gradient' },
    { key: 'C', label: 'Constant width, color bands' },
  ];
  private readonly queryParamMap = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  protected readonly variant = computed(() => this.queryParamMap().get('variant') ?? 'A');
  protected readonly bandEncoding = computed<'width' | 'gradient' | 'bands'>(() => {
    switch (this.variant()) {
      case 'B':
        return 'gradient';
      case 'C':
        return 'bands';
      default:
        return 'width';
    }
  });
  protected setVariant(key: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { variant: key },
      queryParamsHandling: 'merge',
    });
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

  /** Set for a recurring/budget tributary's drill-in panel — null for none open. A one-time Flow/Transfer skips the panel entirely and opens its edit modal directly (see #55's resolution comment). */
  protected readonly openTributary = signal<Tributary | null>(null);
  /** Set when the aggregate uncategorized tributary is clicked, to pulse-highlight the always-visible list below instead of opening a redundant panel. */
  protected readonly isUncategorizedHighlighted = signal(false);
  private readonly transactionReviewEl = viewChild('transactionReview', { read: ElementRef<HTMLElement> });

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

  /** Real Flow/Transfer tributaries plus the aggregate "uncategorized" one sourced from unmatched Transactions — see ticket #63. */
  protected readonly tributaries = computed(() => {
    const account = this.account();
    if (!account) return [];
    return [
      ...buildTributaries(
        this.flows(),
        this.transfers(),
        this.allAccounts(),
        account.id,
        this.selectedDate(),
      ),
      ...buildUncategorizedTributaries(this.transactions(), this.selectedDate()),
    ];
  });

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

  /** A Transaction assignment can also create a Flow inline (AssignFlowDialog), and the drill-in panel can edit either kind, so reload everything mutable. */
  protected async reloadAll(): Promise<void> {
    await Promise.all([this.reloadFlows(), this.reloadTransfers(), this.reloadTransactions()]);
  }

  protected openAddFlow(): void {
    const account = this.account();
    if (!account) return;

    const ref = this.dialog.open<Flow>(FlowFormDialog, { data: { accountId: account.id } });
    ref.closed.subscribe((flow) => {
      if (flow) void this.persistFlow(flow);
    });
  }

  protected openAddTransfer(): void {
    const account = this.account();
    if (!account) return;

    const ref = this.dialog.open<Transfer>(TransferFormDialog, {
      data: { accountId: account.id, accounts: this.allAccounts() },
    });
    ref.closed.subscribe((transfer) => {
      if (transfer) void this.persistTransfer(transfer);
    });
  }

  private async persistFlow(flow: Flow): Promise<void> {
    await this.storage.upsertFlow(flow);
    await this.reloadFlows();
  }

  private async persistTransfer(transfer: Transfer): Promise<void> {
    await this.storage.upsertTransfer(transfer);
    await this.reloadTransfers();
  }

  /**
   * One-time items (a Transfer, or a Flow with `cadence.period === 'once'`) skip the drill-in
   * panel and open straight to editing — there's only one Transaction, so a panel with a
   * one-row list plus an edit button would be pure ceremony. Everything else opens the panel.
   */
  protected onTributaryClick(tributary: Tributary): void {
    if (tributary.kind === 'uncategorized') {
      this.scrollToUncategorized();
      return;
    }

    const flow = tributary.kind === 'flow' ? this.flows().find((f) => f.id === tributary.flowId) : undefined;
    const transfer =
      tributary.kind === 'transfer' ? this.transfers().find((t) => t.id === tributary.transferId) : undefined;
    const isOneTime =
      (flow?.kind === 'recurring' && flow.cadence.period === 'once') || transfer?.cadence.period === 'once';

    if (isOneTime) {
      this.openEditModal(flow, transfer);
      return;
    }

    this.openTributary.set(tributary);
  }

  protected closeTributaryPanel(): void {
    this.openTributary.set(null);
  }

  private openEditModal(flow: Flow | undefined, transfer: Transfer | undefined): void {
    const account = this.account();
    if (!account) return;

    if (flow) {
      const ref = this.dialog.open<Flow>(FlowFormDialog, { data: { accountId: account.id, flow } });
      ref.closed.subscribe((saved) => {
        if (saved) void this.persistFlow(saved);
      });
    } else if (transfer) {
      const ref = this.dialog.open<Transfer>(TransferFormDialog, {
        data: { accountId: account.id, accounts: this.allAccounts(), transfer },
      });
      ref.closed.subscribe((saved) => {
        if (saved) void this.persistTransfer(saved);
      });
    }
  }

  /** Resets to `false` first so a repeat click still re-triggers the CSS pulse — `[class.highlighted]` only replays the animation on an off→on transition. */
  private scrollToUncategorized(): void {
    this.transactionReviewEl()?.nativeElement.scrollIntoView({ block: 'center', behavior: 'smooth' });
    this.isUncategorizedHighlighted.set(false);
    queueMicrotask(() => this.isUncategorizedHighlighted.set(true));
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
