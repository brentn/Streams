import { CurrencyPipe, DatePipe } from '@angular/common';
import { Dialog } from '@angular/cdk/dialog';
import { afterNextRender, Component, computed, ElementRef, inject, input, output, viewChildren } from '@angular/core';
import { applyAssignment } from '../../../core/categorization/apply-assignment';
import { deleteFlowCascade } from '../../../core/categorization/delete-flow-cascade';
import { Account } from '../../../core/models/account';
import { Flow } from '../../../core/models/flow';
import { Transaction } from '../../../core/models/transaction';
import { Transfer } from '../../../core/models/transfer';
import { transferLabel } from '../../../core/models/transfer-label';
import { Tributary } from '../../../core/charting/tributaries';
import { StorageRepository } from '../../../core/storage/storage-repository';
import { AssignFlowDialog, AssignFlowDialogResult } from '../transaction-review/assign-flow-dialog/assign-flow-dialog';
import { FlowFormDialog, FlowFormDialogResult } from '../flow-form-dialog/flow-form-dialog';
import { TransferFormDialog } from '../transfer-form-dialog/transfer-form-dialog';

export interface TributaryDayGroup {
  date: Date;
  transactions: Transaction[];
}

/** Sorts newest first — matches the transaction review list's convention. */
function byDateDescending(a: Transaction, b: Transaction): number {
  return b.date.getTime() - a.date.getTime();
}

/**
 * The slide-over panel a real (non-uncategorized) tributary click opens: an edit button plus a
 * date-grouped transaction list, day-separated and initially scrolled to `selectedDate` — see
 * #55's resolution comment. Not a CDK Dialog — a plain overlay `account-stream` conditionally
 * renders, so `AssignFlowDialog`/`FlowFormDialog`/`TransferFormDialog` can still open as modals
 * on top of it without modal-on-modal stacking.
 */
@Component({
  selector: 'app-tributary-panel',
  imports: [CurrencyPipe, DatePipe],
  templateUrl: './tributary-panel.html',
  styleUrl: './tributary-panel.css',
})
export class TributaryPanel {
  private readonly storage = inject(StorageRepository);
  private readonly dialog = inject(Dialog);

  readonly accountId = input.required<string>();
  readonly tributary = input.required<Tributary>();
  readonly flows = input.required<Flow[]>();
  readonly transfers = input.required<Transfer[]>();
  readonly accounts = input.required<Account[]>();
  readonly transactions = input.required<Transaction[]>();
  readonly selectedDate = input.required<Date>();

  readonly closed = output<void>();
  readonly changed = output<void>();

  private readonly dayGroupRefs = viewChildren<ElementRef<HTMLElement>>('dayGroupRef');

  protected readonly flow = computed(
    () => this.flows().find((f) => f.id === this.tributary().flowId) ?? null,
  );
  protected readonly transfer = computed(
    () => this.transfers().find((t) => t.id === this.tributary().transferId) ?? null,
  );

  /** The Flow's name, or the Transfer framed from this Account's point of view — shown as the header and every row's category badge. */
  protected readonly targetLabel = computed(() => {
    const flow = this.flow();
    if (flow) return flow.name;
    const transfer = this.transfer();
    return transfer ? transferLabel(transfer, this.accountId(), this.accounts()) : '';
  });

  private readonly matchingTransactions = computed(() => {
    const t = this.tributary();
    return this.transactions().filter((txn) =>
      t.kind === 'flow'
        ? txn.matchedTarget?.kind === 'flow' && txn.matchedTarget.id === t.flowId
        : t.kind === 'transfer'
          ? txn.matchedTarget?.kind === 'transfer' && txn.matchedTarget.id === t.transferId
          : false,
    );
  });

  protected readonly dayGroups = computed<TributaryDayGroup[]>(() => {
    const sorted = [...this.matchingTransactions()].sort(byDateDescending);
    const groups: TributaryDayGroup[] = [];
    for (const txn of sorted) {
      const dayStart = new Date(txn.date.getFullYear(), txn.date.getMonth(), txn.date.getDate());
      const last = groups.at(-1);
      if (last && last.date.getTime() === dayStart.getTime()) {
        last.transactions.push(txn);
      } else {
        groups.push({ date: dayStart, transactions: [txn] });
      }
    }
    return groups;
  });

  constructor() {
    afterNextRender(() => this.scrollToSelectedDate());
  }

  /**
   * Groups render newest-first. Scanning from the oldest group forward, the first one still
   * at/after `selectedDate` is the target — same threshold rule as a plain ascending scan, just
   * walked from the other end of the (now reversed) array. No qualifying group means
   * `selectedDate` is later than everything, so fall back to the newest group.
   */
  private scrollToSelectedDate(): void {
    const groups = this.dayGroups();
    if (groups.length === 0) return;
    const selected = this.selectedDate().getTime();
    let targetIndex = 0;
    for (let i = groups.length - 1; i >= 0; i--) {
      if (groups[i].date.getTime() >= selected) {
        targetIndex = i;
        break;
      }
    }
    this.dayGroupRefs()[targetIndex]?.nativeElement.scrollIntoView({ block: 'center' });
  }

  protected editItem(): void {
    const flow = this.flow();
    if (flow) {
      const ref = this.dialog.open<FlowFormDialogResult>(FlowFormDialog, {
        data: { accountId: this.accountId(), flow },
      });
      ref.closed.subscribe((result) => {
        if (result === 'deleted') {
          void this.deleteFlowAndClose(flow.id);
        } else if (result) {
          void this.persistFlow(result);
        }
      });
      return;
    }

    const transfer = this.transfer();
    if (transfer) {
      const ref = this.dialog.open<Transfer>(TransferFormDialog, {
        data: { accountId: this.accountId(), accounts: this.accounts(), transfer },
      });
      ref.closed.subscribe((saved) => {
        if (saved) void this.persistTransfer(saved);
      });
    }
  }

  private async persistFlow(flow: Flow): Promise<void> {
    await this.storage.upsertFlow(flow);
    this.changed.emit();
  }

  /** The panel is showing a Flow that no longer exists once this resolves, so it closes itself. */
  private async deleteFlowAndClose(flowId: string): Promise<void> {
    await deleteFlowCascade(this.storage, this.transactions(), flowId);
    this.changed.emit();
    this.close();
  }

  private async persistTransfer(transfer: Transfer): Promise<void> {
    await this.storage.upsertTransfer(transfer);
    this.changed.emit();
  }

  protected openAssignForm(transaction: Transaction): void {
    const ref = this.dialog.open<AssignFlowDialogResult>(AssignFlowDialog, {
      data: {
        transaction,
        flows: this.flows(),
        transfers: this.transfers(),
        accounts: this.accounts(),
        transactions: this.transactions(),
      },
    });
    ref.closed.subscribe((result) => {
      if (result) void this.applyAssignmentAndEmit(result);
    });
  }

  private async applyAssignmentAndEmit(result: AssignFlowDialogResult): Promise<void> {
    await applyAssignment(this.storage, this.transactions(), result);
    this.changed.emit();
  }

  protected close(): void {
    this.closed.emit();
  }
}
