import { Component, input, output, signal } from '@angular/core';
import { AmountChange, RecurringRule, StepChange } from '../../core/models/flow';
import { dateInputValue, parseDateInput } from '../date-input';

/**
 * The Step Change / Recurring Rule timeline editor for a Flow's amount (or limit) or a
 * Transfer's amount — shared so every schedulable amount gets the same editor instead of
 * duplicating the add/remove/describe wiring per form.
 */
@Component({
  selector: 'app-amount-changes-editor',
  templateUrl: './amount-changes-editor.html',
  styleUrl: './amount-changes-editor.css',
})
export class AmountChangesEditor {
  readonly changes = input.required<AmountChange[]>();
  /** What the changing value is called in this form's context — "amount" or "limit". */
  readonly amountLabel = input<string>('amount');
  readonly changesUpdated = output<AmountChange[]>();

  protected readonly newStepDate = signal(new Date());
  protected readonly newStepAmount = signal(0);
  protected readonly newRuleDate = signal(new Date());
  protected readonly newRuleDelta = signal(0);

  protected readonly dateInputValue = dateInputValue;

  protected onNewStepDateInput(value: string): void {
    this.newStepDate.set(parseDateInput(value));
  }

  protected onNewRuleDateInput(value: string): void {
    this.newRuleDate.set(parseDateInput(value));
  }

  protected addStepChange(): void {
    const change: StepChange = {
      type: 'step',
      effectiveDate: this.newStepDate(),
      amount: this.newStepAmount(),
    };
    this.changesUpdated.emit([...this.changes(), change]);
    this.newStepAmount.set(0);
  }

  protected addRecurringRule(): void {
    const rule: RecurringRule = {
      type: 'recurring-rule',
      anniversaryDate: this.newRuleDate(),
      delta: this.newRuleDelta(),
    };
    this.changesUpdated.emit([...this.changes(), rule]);
    this.newRuleDelta.set(0);
  }

  protected removeAmountChange(index: number): void {
    this.changesUpdated.emit(this.changes().filter((_, i) => i !== index));
  }

  protected describeAmountChange(change: AmountChange): string {
    return change.type === 'step'
      ? `Step Change to ${change.amount} from ${this.dateInputValue(change.effectiveDate)}`
      : `Recurring Rule: ${change.delta >= 0 ? '+' : ''}${change.delta} every ${this.dateInputValue(change.anniversaryDate)}`;
  }
}
