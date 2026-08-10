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
import { RouterLink } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { deleteFlowCascade } from '../../core/categorization/delete-flow-cascade';
import { deleteTransferCascade } from '../../core/categorization/delete-transfer-cascade';
import { Account } from '../../core/models/account';
import { BudgetFlow, Flow, isOneTimeFlow } from '../../core/models/flow';
import { SkippedOccurrence } from '../../core/models/skipped-occurrence';
import { Transaction } from '../../core/models/transaction';
import { Transfer } from '../../core/models/transfer';
import {
  balanceAtDate,
  balanceSeries,
  runningDryAlert,
  withOutstandingOccurrences,
} from '../../core/projection/projection-engine';
import { signedBalance } from '../../core/charting/balance-color';
import { BandPoint } from '../../core/charting/band-segments';
import {
  boundaryXFor,
  buildWindowDates,
  clampDayOffset,
  dayOffsetFor,
  selectedDateFor,
  WINDOW_DAYS,
} from '../../core/charting/date-window';
import {
  budgetDrillInTributary,
  buildTributaries,
  buildUncategorizedTributaries,
  Tributary,
  withOutstandingTributaries,
} from '../../core/charting/tributaries';
import { bannerPresentation, derivedBannerState } from '../../core/sync/sync-presentation';
import { reloadOnSyncComplete, SyncCoordinator } from '../../core/sync/sync-coordinator';
import { StorageRepository } from '../../core/storage/storage-repository';
import { CalendarChip } from '../../shared/calendar-chip/calendar-chip';
import { DragScrub } from '../../shared/drag-scrub/drag-scrub.directive';
import { StatusBanner } from '../../shared/status-banner/status-banner';
import { StreamBand } from '../../shared/stream-band/stream-band';
import { BudgetList } from './budget-list/budget-list';
import { FlowFormDialog, FlowFormDialogResult } from './flow-form-dialog/flow-form-dialog';
import { OutstandingFlowRow } from './outstanding-flow-row/outstanding-flow-row';
import { TransferFormDialog, TransferFormDialogResult } from './transfer-form-dialog/transfer-form-dialog';
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
    StatusBanner,
    StreamBand,
    TransactionReview,
    BudgetList,
    OutstandingFlowRow,
    TributaryPanel,
  ],
  templateUrl: './account-stream.html',
  styleUrl: './account-stream.css',
})
export class AccountStream {
  private readonly storage = inject(StorageRepository);
  private readonly syncCoordinator = inject(SyncCoordinator);
  private readonly dialog = inject(Dialog);

  readonly id = input.required<string>();

  protected readonly windowDays = WINDOW_DAYS;

  protected readonly account = signal<Account | null>(null);
  protected readonly allAccounts = signal<Account[]>([]);
  protected readonly transactions = signal<Transaction[]>([]);
  protected readonly flows = signal<Flow[]>([]);
  protected readonly transfers = signal<Transfer[]>([]);
  protected readonly skippedOccurrences = signal<SkippedOccurrence[]>([]);
  protected readonly dayOffset = signal(0);
  protected readonly isSyncing = this.syncCoordinator.isSyncing;
  protected readonly operationError = this.syncCoordinator.operationError;

  /** Merges the transient operation-error with the loaded Account's persisted syncStatus — see `sync-presentation.ts`. */
  protected readonly bannerState = computed(() =>
    derivedBannerState(this.operationError(), this.account()?.syncStatus),
  );
  protected readonly banner = computed(() => bannerPresentation(this.bannerState()));

  protected readonly selectedDate = computed(() => selectedDateFor(this.dayOffset()));

  /** Set for a recurring/budget tributary's drill-in panel — null for none open. A one-time Flow/Transfer skips the panel entirely and opens its edit modal directly (see #55's resolution comment). */
  protected readonly openTributary = signal<Tributary | null>(null);
  /** Set when the aggregate uncategorized tributary is clicked, to pulse-highlight the always-visible list below instead of opening a redundant panel. */
  protected readonly isUncategorizedHighlighted = signal(false);
  private readonly transactionReviewEl = viewChild('transactionReview', { read: ElementRef<HTMLElement> });

  /** `flows` with every currently-Outstanding recurring-kind Flow's missing occurrence restored as a synthetic today-dated one — see ADR-0012. Feeds every balance/Dry Floor projection below; `buildTributaries` deliberately keeps reading the raw `flows()` signal instead — its own rendering of Outstanding is layered on separately, via `withOutstandingTributaries` (#88). */
  protected readonly effectiveFlows = computed(() => {
    const account = this.account();
    return account
      ? withOutstandingOccurrences(
          this.flows(),
          this.transactions(),
          account,
          new Date(),
          this.skippedOccurrences(),
        )
      : this.flows();
  });

  /** Recomputed from the current Account/Flow/Transfer/Transaction state, so it updates automatically as new Transactions sync in and the projection shifts. */
  protected readonly dryAlert = computed(() => {
    const account = this.account();
    if (!account) return null;
    return runningDryAlert(
      account,
      this.transactions(),
      this.effectiveFlows(),
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
          this.effectiveFlows(),
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
    return account !== null && balance !== null && signedBalance(balance, account.expectedSign) < 0;
  });

  private readonly windowDates = computed(() => buildWindowDates(this.selectedDate()));

  protected readonly points = computed<BandPoint[]>(() => {
    const account = this.account();
    if (!account) return [];
    return balanceSeries(
      account,
      this.transactions(),
      this.windowDates(),
      this.effectiveFlows(),
      this.transfers(),
    ).map((p, i) => ({ x: i, balance: p.balance }));
  });

  /**
   * Real Flow/Transfer tributaries plus the aggregate "uncategorized" one sourced from unmatched
   * Transactions (see ticket #63), then layered with Outstanding-Flow rendering (#88, #91): the
   * missed occurrence's own Tributary is excluded, replaced by a same-day "Pending" stand-in at
   * today's position. `buildUncategorizedTributaries`/`buildTributaries` output is what gets
   * layered — Outstanding doesn't touch the uncategorized bucket.
   */
  protected readonly tributaries = computed(() => {
    const account = this.account();
    if (!account) return [];
    const base = [
      ...buildTributaries(
        this.flows(),
        this.transfers(),
        this.allAccounts(),
        account.id,
        this.selectedDate(),
      ),
      ...buildUncategorizedTributaries(this.transactions(), this.selectedDate()),
    ];
    return withOutstandingTributaries(
      base,
      this.flows(),
      this.transactions(),
      account,
      new Date(),
      this.selectedDate(),
      this.skippedOccurrences(),
    );
  });

  protected readonly boundaryX = computed(() => {
    const account = this.account();
    return account ? boundaryXFor(account.balanceDate, this.selectedDate()) : 0;
  });

  constructor() {
    effect(() => {
      void this.load(this.id());
    });

    // Reflects a sync that finished elsewhere — e.g. ADR-0004's app-open auto-resync or
    // SyncCoordinator's own return-to-tab retry after Reauthorize, both already in flight by the
    // time this view mounts — without the user taking any action in this view.
    reloadOnSyncComplete(this.syncCoordinator, () => void this.load(this.id()));
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
    this.skippedOccurrences.set(account ? await this.storage.getSkippedOccurrences() : []);
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

  protected async reloadSkippedOccurrences(): Promise<void> {
    this.skippedOccurrences.set(await this.storage.getSkippedOccurrences());
  }

  /** A Transaction assignment can also create a Flow inline (AssignFlowDialog), and the drill-in panel can edit either kind, so reload everything mutable. */
  protected async reloadAll(): Promise<void> {
    await Promise.all([this.reloadFlows(), this.reloadTransfers(), this.reloadTransactions()]);
  }

  /** Resolving an Outstanding tile (#97) either re-categorizes a Transaction or persists a Skip — never creates a Flow/Transfer, so only these two need refreshing. */
  protected async reloadOutstanding(): Promise<void> {
    await Promise.all([this.reloadTransactions(), this.reloadSkippedOccurrences()]);
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
    const isOneTime = (flow ? isOneTimeFlow(flow) : false) || transfer?.cadence.period === 'once';

    if (isOneTime) {
      this.openEditModal(flow, transfer);
      return;
    }

    this.openTributary.set(tributary);
  }

  protected closeTributaryPanel(): void {
    this.openTributary.set(null);
  }

  /** A budget-kind Flow has no stream tributary to click (#72) — its Budgets-list row opens the same drill-in panel via a synthetic Tributary. */
  protected onBudgetClick(flow: BudgetFlow): void {
    this.openTributary.set(budgetDrillInTributary(flow, this.selectedDate()));
  }

  private openEditModal(flow: Flow | undefined, transfer: Transfer | undefined): void {
    const account = this.account();
    if (!account) return;

    if (flow) {
      const ref = this.dialog.open<FlowFormDialogResult>(FlowFormDialog, {
        data: { accountId: account.id, flow },
      });
      ref.closed.subscribe((result) => {
        if (result === 'deleted') {
          void this.deleteFlowAndReload(flow.id);
        } else if (result) {
          void this.persistFlow(result);
        }
      });
    } else if (transfer) {
      const ref = this.dialog.open<TransferFormDialogResult>(TransferFormDialog, {
        data: { accountId: account.id, accounts: this.allAccounts(), transfer },
      });
      ref.closed.subscribe((result) => {
        if (result === 'deleted') {
          void this.deleteTransferAndReload(transfer);
        } else if (result) {
          void this.persistTransfer(result);
        }
      });
    }
  }

  private async deleteFlowAndReload(flowId: string): Promise<void> {
    await deleteFlowCascade(this.storage, this.transactions(), flowId);
    await this.reloadAll();
  }

  private async deleteTransferAndReload(transfer: Transfer): Promise<void> {
    await deleteTransferCascade(this.storage, transfer);
    await this.reloadAll();
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

  protected onDateSelected(date: Date): void {
    this.dayOffset.set(dayOffsetFor(date));
  }

  protected async resync(): Promise<void> {
    await this.syncCoordinator.resync();
    await this.load(this.id());
  }

  /** The banner's action button follows whichever state is showing (see `bannerPresentation`) — Reauthorize additionally opens the SimpleFIN Bridge to re-link and, per `SyncCoordinator.reauthorize`, keeps retrying on this tab's own return until it clears; a plain Retry just resyncs once. */
  protected onBannerAction(): void {
    if (this.bannerState().kind === 'needs-reauth') {
      void this.syncCoordinator.reauthorize().then(() => this.load(this.id()));
    } else {
      void this.resync();
    }
  }
}
