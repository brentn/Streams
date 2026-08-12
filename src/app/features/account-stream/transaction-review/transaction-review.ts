import { CurrencyPipe, DatePipe } from '@angular/common';
import { Dialog } from '@angular/cdk/dialog';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { applyAssignment } from '../../../core/categorization/apply-assignment';
import { isIgnored } from '../../../core/categorization/ignored-transactions';
import { Account } from '../../../core/models/account';
import { DirectCategorization } from '../../../core/models/direct-categorization';
import { Flow } from '../../../core/models/flow';
import { IgnoredTransaction } from '../../../core/models/ignored-transaction';
import { Transaction } from '../../../core/models/transaction';
import { Transfer } from '../../../core/models/transfer';
import { StorageRepository } from '../../../core/storage/storage-repository';
import { AssignFlowDialog, AssignFlowDialogResult } from './assign-flow-dialog/assign-flow-dialog';

/** Sorts newest first — a review list reads top-down like a bank statement. */
function byDateDescending(a: Transaction, b: Transaction): number {
  return b.date.getTime() - a.date.getTime();
}

/**
 * Renders whatever Transactions/Flows/Transfers the parent hands it — it doesn't fetch
 * its own copy. `account-stream` owns both canonical signals for the whole
 * page, so a Flow created inline from the Assign dialog (or a Transaction
 * re-categorized here) is visible everywhere on the page immediately instead
 * of only in whichever component happened to fetch it.
 */
@Component({
  selector: 'app-transaction-review',
  imports: [CurrencyPipe, DatePipe],
  templateUrl: './transaction-review.html',
  styleUrl: './transaction-review.css',
})
export class TransactionReview {
  private readonly storage = inject(StorageRepository);
  private readonly dialog = inject(Dialog);

  readonly transactions = input.required<Transaction[]>();
  readonly flows = input.required<Flow[]>();
  readonly transfers = input.required<Transfer[]>();
  readonly accounts = input.required<Account[]>();
  readonly directCategorizations = input.required<DirectCategorization[]>();
  readonly ignoredTransactions = input.required<IgnoredTransaction[]>();
  readonly changed = output<void>();

  /** Nothing matched any Categorization Rule — needs a human decision. Paired 1:1 with the aggregate uncategorized tributary on the chart above: both are absent together when this is empty. An Ignored Transaction (ADR-0019) is excluded even though it's otherwise unmatched. */
  protected readonly unmatched = computed(() =>
    this.transactions()
      .filter((t) => t.matchedTarget === null && !isIgnored(t.id, this.ignoredTransactions()))
      .sort(byDateDescending),
  );

  /** The row currently showing "Ignore this transaction? [Confirm] [Cancel]" instead of its normal actions — null when no row is mid-confirm. */
  protected readonly confirmingIgnoreId = signal<string | null>(null);

  protected startIgnore(transactionId: string): void {
    this.confirmingIgnoreId.set(transactionId);
  }

  protected cancelIgnore(): void {
    this.confirmingIgnoreId.set(null);
  }

  protected async confirmIgnore(transaction: Transaction): Promise<void> {
    this.confirmingIgnoreId.set(null);
    await this.applyAssignmentAndEmit({ mode: 'ignore', transactionId: transaction.id });
  }

  protected openAssignForm(transaction: Transaction): void {
    const ref = this.dialog.open<AssignFlowDialogResult>(AssignFlowDialog, {
      data: {
        transaction,
        flows: this.flows(),
        transfers: this.transfers(),
        accounts: this.accounts(),
        transactions: this.transactions(),
        hasDirectCategorization: this.directCategorizations().some((d) => d.transactionId === transaction.id),
      },
    });

    ref.closed.subscribe((result) => {
      if (result) void this.applyAssignmentAndEmit(result);
    });
  }

  /** Re-derives `matchedTarget` for every currently loaded Transaction, not just the one being corrected — see `applyAssignment`'s own doc comment. */
  private async applyAssignmentAndEmit(result: AssignFlowDialogResult): Promise<void> {
    await applyAssignment(this.storage, this.transactions(), result);
    this.changed.emit();
  }
}
