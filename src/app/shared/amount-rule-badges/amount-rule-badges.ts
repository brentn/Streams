import { Dialog } from '@angular/cdk/dialog';
import { Component, computed, inject, input, output } from '@angular/core';
import { AmountChange } from '../../core/models/flow';
import { AmountChangeDialog, AmountChangeDialogData } from '../amount-change-dialog/amount-change-dialog';

/**
 * The Step Change / Recurring Rule dot-badge buttons for a FlowForm/TransferForm's Amount-rules
 * card header — each opens its own `AmountChangeDialog` modal, replacing the always-visible
 * fieldset `AmountChangesEditor` used to render, and shows a count once a rule of that kind is set.
 */
@Component({
  selector: 'app-amount-rule-badges',
  templateUrl: './amount-rule-badges.html',
  styleUrl: './amount-rule-badges.css',
})
export class AmountRuleBadges {
  private readonly dialog = inject(Dialog);

  readonly changes = input.required<AmountChange[]>();
  /** What the changing value is called in this form's context — "amount" or "limit". */
  readonly amountLabel = input<string>('amount');
  readonly changesUpdated = output<AmountChange[]>();

  protected readonly stepChangeCount = computed(
    () => this.changes().filter((c) => c.type === 'step').length,
  );
  protected readonly recurringRuleCount = computed(
    () => this.changes().filter((c) => c.type === 'recurring-rule').length,
  );

  protected openAmountChangeDialog(mode: AmountChange['type']): void {
    const ref = this.dialog.open<AmountChange[]>(AmountChangeDialog, {
      data: { mode, changes: this.changes(), amountLabel: this.amountLabel() } satisfies AmountChangeDialogData,
    });
    ref.closed.subscribe((result) => {
      if (result) this.changesUpdated.emit(result);
    });
  }
}
