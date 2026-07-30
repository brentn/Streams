import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, inject, signal } from '@angular/core';
import { AmountChange, RecurringRule, StepChange } from '../../core/models/flow';
import { dateInputValue, parseDateInput } from '../date-input';
import { numberInputValue } from '../number-input';

export interface AmountChangeDialogData {
  mode: AmountChange['type'];
  changes: AmountChange[];
  /** What the changing value is called in this form's context — "amount" or "limit". */
  amountLabel?: string;
}

/**
 * The Step Change / Recurring Rule timeline editor, opened as its own modal from the dot-badge
 * buttons in FlowForm/TransferForm's Amount-rules card header — replaces the always-visible
 * fieldset `AmountChangesEditor` used to render. Closes with the full, updated AmountChange[]
 * (this mode's edits merged back alongside the other mode's changes, untouched), or no result
 * on cancel.
 */
@Component({
  selector: 'app-amount-change-dialog',
  templateUrl: './amount-change-dialog.html',
  styleUrl: './amount-change-dialog.css',
})
export class AmountChangeDialog {
  private readonly dialogRef = inject(DialogRef<AmountChange[]>);
  protected readonly data = inject<AmountChangeDialogData>(DIALOG_DATA);

  private readonly otherChanges = this.data.changes.filter((c) => c.type !== this.data.mode);
  protected readonly changes = signal(this.data.changes.filter((c) => c.type === this.data.mode));

  protected readonly newDate = signal(new Date());
  protected readonly newValue = signal(0);

  protected readonly amountLabel = this.data.amountLabel ?? 'amount';
  protected readonly dateInputValue = dateInputValue;
  protected readonly numberInputValue = numberInputValue;

  protected onDateInput(value: string): void {
    this.newDate.set(parseDateInput(value));
  }

  protected add(): void {
    const change: AmountChange =
      this.data.mode === 'step'
        ? ({ type: 'step', effectiveDate: this.newDate(), amount: this.newValue() } satisfies StepChange)
        : ({
            type: 'recurring-rule',
            anniversaryDate: this.newDate(),
            delta: this.newValue(),
          } satisfies RecurringRule);
    this.changes.update((changes) => [...changes, change]);
    this.newValue.set(0);
  }

  protected remove(index: number): void {
    this.changes.update((changes) => changes.filter((_, i) => i !== index));
  }

  protected describe(change: AmountChange): string {
    return change.type === 'step'
      ? `Step Change to ${change.amount} from ${this.dateInputValue(change.effectiveDate)}`
      : `Recurring Rule: ${change.delta >= 0 ? '+' : ''}${change.delta} every ${this.dateInputValue(change.anniversaryDate)}`;
  }

  protected save(): void {
    this.dialogRef.close([...this.otherChanges, ...this.changes()]);
  }

  protected cancel(): void {
    this.dialogRef.close();
  }
}
