import { CurrencyPipe, DatePipe } from '@angular/common';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, inject, signal } from '@angular/core';
import { isSubstringMatch, normalizeMatchText } from '../../../../core/categorization/categorization';
import { Flow } from '../../../../core/models/flow';
import { Transaction } from '../../../../core/models/transaction';
import { FlowForm } from '../../flow-form/flow-form';

export interface AssignFlowDialogData {
  transaction: Transaction;
  flows: Flow[];
}

export interface AssignFlowDialogResult {
  matchText: string;
  flowId: string;
  /** Set when the chosen Flow was just created in this dialog and doesn't exist in storage yet — the caller persists it before the Categorization Rule. */
  newFlow?: Flow;
}

/** A focused dialog for assigning/correcting one Transaction's Flow — surfaced right where the user clicked, instead of an inline form buried at the bottom of a long list. */
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
  protected readonly matchText = signal(this.data.transaction.description);
  protected readonly selectedFlowId = signal<string | null>(
    this.data.transaction.matchedFlowId ?? this.data.flows[0]?.id ?? null,
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
    this.selectedFlowId.set(flow.id);
    this.isCreatingFlow.set(false);
  }

  protected onFlowCreationCancelled(): void {
    this.isCreatingFlow.set(false);
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();

    const matchText = normalizeMatchText(this.matchText());
    const flowId = this.selectedFlowId();
    if (!matchText || !flowId) return;

    if (!isSubstringMatch(this.data.transaction.description, matchText)) {
      this.formError.set("Match text must appear within this transaction's description.");
      return;
    }

    this.dialogRef.close({ matchText, flowId, newFlow: this.pendingNewFlows.get(flowId) });
  }

  protected cancel(): void {
    this.dialogRef.close();
  }
}
