import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, inject, signal } from '@angular/core';
import { AmountChange, RecurringRule, StepChange } from '../../../core/models/flow';
import { dateInputValue, parseDateInput } from '../../../shared/date-input';
import { numberInputValue } from '../../../shared/number-input';

export interface AmountChangeSubModalData {
  mode: 'step' | 'recurring';
  changes: AmountChange[];
}

/**
 * PROTOTYPE — wayfinder ticket #53. The "own modal dialog" the ticket asks Step Changes and
 * Recurring Rules to be hidden behind, factored out of the always-visible fieldset the real
 * `amount-changes-editor` renders today. Shared by all three main-dialog variants — the
 * ticket's variation point is how the main dialog surfaces/badges this, not this sub-modal's
 * own layout.
 */
@Component({
  selector: 'app-amount-change-sub-modal',
  templateUrl: './amount-change-sub-modal.html',
  styleUrl: './amount-change-sub-modal.css',
})
export class AmountChangeSubModal {
  private readonly dialogRef = inject(DialogRef<AmountChange[]>);
  protected readonly data = inject<AmountChangeSubModalData>(DIALOG_DATA);

  private readonly targetType = this.data.mode === 'step' ? 'step' : 'recurring-rule';
  private readonly otherChanges = this.data.changes.filter((c) => c.type !== this.targetType);
  protected readonly changes = signal(this.data.changes.filter((c) => c.type === this.targetType));

  protected readonly newDate = signal(new Date());
  protected readonly newValue = signal(0);

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
