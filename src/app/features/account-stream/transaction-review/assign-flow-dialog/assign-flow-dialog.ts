import { CurrencyPipe, DatePipe } from '@angular/common';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import { isSubstringMatch, normalizeMatchText } from '../../../../core/categorization/categorization';
import { Account } from '../../../../core/models/account';
import { Flow, isOneTimeFlow } from '../../../../core/models/flow';
import { MatchedTarget, Transaction } from '../../../../core/models/transaction';
import { transferOptionLabel } from '../../../../core/models/transfer-label';
import { Transfer } from '../../../../core/models/transfer';
import { FlowForm } from '../../flow-form/flow-form';

export interface AssignFlowDialogData {
  transaction: Transaction;
  flows: Flow[];
  transfers: Transfer[];
  accounts: Account[];
  /** Used to exclude an already-used one-time Flow from the options — see `availableFlows`. */
  transactions: Transaction[];
}

/** A one-time Flow is a single, non-repeating occurrence — once any Transaction is matched to it, it's used up and shouldn't be offered again, not even to the Transaction it's already assigned to. */
function isUsedOneTimeFlow(flow: Flow, transactions: Transaction[]): boolean {
  return (
    isOneTimeFlow(flow) &&
    transactions.some((t) => t.matchedTarget?.kind === 'flow' && t.matchedTarget.id === flow.id)
  );
}

export interface AssignFlowDialogResult {
  matchText: string;
  target: MatchedTarget;
  /** Set when the chosen Flow was just created in this dialog and doesn't exist in storage yet — the caller persists it before the Categorization Rule. */
  newFlow?: Flow;
}

/** A focused dialog for assigning/correcting one Transaction's Flow or Transfer — surfaced right where the user clicked, instead of an inline form buried at the bottom of a long list. */
@Component({
  selector: 'app-assign-flow-dialog',
  imports: [CurrencyPipe, DatePipe, FlowForm],
  templateUrl: './assign-flow-dialog.html',
  styleUrl: './assign-flow-dialog.css',
})
export class AssignFlowDialog {
  private readonly dialogRef = inject(DialogRef<AssignFlowDialogResult>);
  protected readonly data = inject<AssignFlowDialogData>(DIALOG_DATA);

  protected readonly flows = signal(this.data.flows);
  /** `flows`, filtered to drop already-used one-time Flows and sorted alphabetically — what the dropdown actually offers. */
  protected readonly availableFlows = computed(() =>
    this.flows()
      .filter((flow) => !isUsedOneTimeFlow(flow, this.data.transactions))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
  protected readonly matchText = signal(this.data.transaction.description);
  protected readonly selectedTarget = signal<MatchedTarget | null>(
    this.data.transaction.matchedTarget ??
      (this.availableFlows()[0] ? { kind: 'flow', id: this.availableFlows()[0].id } : null) ??
      (this.data.transfers[0] ? { kind: 'transfer', id: this.data.transfers[0].id } : null),
  );
  protected readonly formError = signal<string | null>(null);
  protected readonly isCreatingFlow = signal(false);
  /** Keyed by id (not just "the last one created") so switching between several created-but-unpersisted Flows within one dialog session still resolves the right one at submit time. */
  private readonly pendingNewFlows = new Map<string, Flow>();

  protected startCreatingFlow(): void {
    this.isCreatingFlow.set(true);
  }

  protected onFlowCreated(flow: Flow): void {
    this.pendingNewFlows.set(flow.id, flow);
    this.flows.update((flows) => [...flows, flow]);
    this.selectedTarget.set({ kind: 'flow', id: flow.id });
    this.isCreatingFlow.set(false);
  }

  protected onFlowCreationCancelled(): void {
    this.isCreatingFlow.set(false);
  }

  protected encodeTarget(target: MatchedTarget): string {
    return `${target.kind}:${target.id}`;
  }

  protected onTargetChange(value: string): void {
    const [kind, id] = value.split(':');
    this.selectedTarget.set(kind === 'transfer' ? { kind: 'transfer', id } : { kind: 'flow', id });
  }

  protected transferLabel(transfer: Transfer): string {
    return transferOptionLabel(
      transfer,
      this.data.transaction.accountId,
      this.data.accounts,
      this.data.transaction.date,
    );
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();

    const matchText = normalizeMatchText(this.matchText());
    const target = this.selectedTarget();
    if (!matchText || !target) return;

    if (!isSubstringMatch(this.data.transaction.description, matchText)) {
      this.formError.set("Match text must appear within this transaction's description.");
      return;
    }

    this.dialogRef.close({
      matchText,
      target,
      newFlow: target.kind === 'flow' ? this.pendingNewFlows.get(target.id) : undefined,
    });
  }

  protected cancel(): void {
    this.dialogRef.close();
  }
}
