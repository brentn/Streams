import { CurrencyPipe, DatePipe } from '@angular/common';
import { Dialog } from '@angular/cdk/dialog';
import { Component, computed, inject, input, output } from '@angular/core';
import { categorizeTransactions } from '../../../core/categorization/categorization';
import { Flow } from '../../../core/models/flow';
import { Transaction } from '../../../core/models/transaction';
import { StorageRepository } from '../../../core/storage/storage-repository';
import { AssignFlowDialog, AssignFlowDialogResult } from './assign-flow-dialog/assign-flow-dialog';

/** Sorts newest first — a review list reads top-down like a bank statement. */
function byDateDescending(a: Transaction, b: Transaction): number {
  return b.date.getTime() - a.date.getTime();
}

/**
 * Renders whatever Transactions/Flows the parent hands it — it doesn't fetch
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
  readonly changed = output<void>();

  /** Unmatched Transactions are surfaced first — nothing matched no Categorization Rule and needs a human decision. */
  protected readonly unmatched = computed(() =>
    this.transactions()
      .filter((t) => t.matchedFlowId === null)
      .sort(byDateDescending),
  );

  protected readonly matched = computed(() =>
    this.transactions()
      .filter((t) => t.matchedFlowId !== null)
      .sort(byDateDescending),
  );

  protected flowName(flowId: string): string {
    return this.flows().find((f) => f.id === flowId)?.name ?? '(unknown Flow)';
  }

  protected openAssignForm(transaction: Transaction): void {
    const ref = this.dialog.open<AssignFlowDialogResult>(AssignFlowDialog, {
      data: { transaction, flows: this.flows() },
    });

    ref.closed.subscribe((result) => {
      if (result) void this.applyAssignment(transaction.id, result);
    });
  }

  /**
   * Saving overwrites the Categorization Rule for the given match text, then
   * re-derives `matchedFlowId` for every currently loaded Transaction — not
   * just the one being corrected — so any other already-synced Transaction
   * sharing that merchant text (still sitting in "Needs categorization")
   * picks up the correction immediately rather than waiting for the next sync.
   */
  private async applyAssignment(
    transactionId: string,
    { matchText, flowId, newFlow }: AssignFlowDialogResult,
  ): Promise<void> {
    const transaction = this.transactions().find((t) => t.id === transactionId);
    if (!transaction) return;

    if (newFlow) await this.storage.upsertFlow(newFlow);
    await this.storage.upsertCategorizationRule({ matchText, flowId });
    const rules = await this.storage.getCategorizationRules();
    await this.storage.upsertTransactions(categorizeTransactions(this.transactions(), rules));

    this.changed.emit();
  }
}
