import { CurrencyPipe, DatePipe } from '@angular/common';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import { isSubstringMatch, normalizeMatchText } from '../../../../core/categorization/categorization';
import { rankMatchCandidates } from '../../../../core/categorization/outstanding-match-candidates';
import { CategorizationRule } from '../../../../core/models/categorization-rule';
import { RecurringFlow } from '../../../../core/models/flow';
import { MatchedTarget, Transaction } from '../../../../core/models/transaction';

export interface ResolveOutstandingDialogData {
  flow: RecurringFlow;
  occurrenceDate: Date;
  amount: number;
  transactions: Transaction[];
  categorizationRules: CategorizationRule[];
}

export type ResolveOutstandingDialogResult =
  | { kind: 'assign'; matchText: string; target: MatchedTarget }
  | { kind: 'skip'; flowId: string; occurrenceDate: Date };

/**
 * Opened by clicking an Outstanding tile (#96/#97): shows the Flow's name/amount/due date, then
 * either walks through picking+confirming a matching Transaction (mirroring `AssignFlowDialog`'s
 * substring validation, just entered from the Flow side) or skips the occurrence outright via
 * #95's storage. Persistence itself happens in the caller once this closes, the same division of
 * labor `AssignFlowDialog` uses.
 */
@Component({
  selector: 'app-resolve-outstanding-dialog',
  imports: [CurrencyPipe, DatePipe],
  templateUrl: './resolve-outstanding-dialog.html',
  styleUrl: './resolve-outstanding-dialog.css',
})
export class ResolveOutstandingDialog {
  private readonly dialogRef = inject(DialogRef<ResolveOutstandingDialogResult>);
  protected readonly data = inject<ResolveOutstandingDialogData>(DIALOG_DATA);

  protected readonly candidates = computed(() =>
    rankMatchCandidates(
      this.data.flow,
      this.data.occurrenceDate,
      this.data.amount,
      this.data.transactions,
      this.data.categorizationRules,
    ),
  );

  protected readonly selectedTransaction = signal<Transaction | null>(null);
  protected readonly matchText = signal('');
  protected readonly formError = signal<string | null>(null);

  protected selectCandidate(transaction: Transaction): void {
    this.selectedTransaction.set(transaction);
    this.matchText.set(transaction.description);
    this.formError.set(null);
  }

  protected backToCandidates(): void {
    this.selectedTransaction.set(null);
    this.formError.set(null);
  }

  protected confirmAssign(event: Event): void {
    event.preventDefault();

    const transaction = this.selectedTransaction();
    const matchText = normalizeMatchText(this.matchText());
    if (!transaction || !matchText) return;

    if (!isSubstringMatch(transaction.description, matchText)) {
      this.formError.set("Match text must appear within this transaction's description.");
      return;
    }

    this.dialogRef.close({
      kind: 'assign',
      matchText,
      target: { kind: 'flow', id: this.data.flow.id },
    });
  }

  protected skip(): void {
    this.dialogRef.close({
      kind: 'skip',
      flowId: this.data.flow.id,
      occurrenceDate: this.data.occurrenceDate,
    });
  }

  protected cancel(): void {
    this.dialogRef.close();
  }
}
