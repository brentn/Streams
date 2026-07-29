import { Component, computed, effect, input, output, signal } from '@angular/core';
import { Account } from '../../../core/models/account';
import { AmountChange } from '../../../core/models/flow';
import { Transfer } from '../../../core/models/transfer';
import {
  buildCadence,
  cadenceEndDateError,
  CadenceFields,
  CadenceOption,
  defaultCadenceFields,
  describeCadence,
} from '../../../core/projection/cadence-options';
import { AmountChangesEditor } from '../../../shared/amount-changes-editor/amount-changes-editor';
import { CadencePicker } from '../../../shared/cadence-picker/cadence-picker';
import { numberInputValue } from '../../../shared/number-input';

/** `out` of this Account (it's the from-side), `in` to this Account (it's the to-side). */
export type TransferDirection = 'in' | 'out';

/**
 * Collects a Transfer's fields, framed from the current Account's point of view (direction +
 * the other Account), and emits a fully-built Transfer — same non-persisting shape as FlowForm.
 */
@Component({
  selector: 'app-transfer-form',
  imports: [CadencePicker, AmountChangesEditor],
  templateUrl: './transfer-form.html',
  styleUrl: './transfer-form.css',
})
export class TransferForm {
  readonly accountId = input.required<string>();
  readonly accounts = input.required<Account[]>();
  readonly transfer = input<Transfer | null>(null);
  readonly saved = output<Transfer>();
  readonly cancelled = output<void>();

  protected readonly direction = signal<TransferDirection>('out');
  protected readonly otherAccountId = signal('');
  protected readonly amount = signal(0);
  protected readonly cadenceOption = signal<CadenceOption>('monthly');
  protected readonly cadenceFields = signal<CadenceFields>(defaultCadenceFields());
  protected readonly amountChanges = signal<AmountChange[]>([]);

  protected readonly numberInputValue = numberInputValue;

  protected readonly otherAccounts = computed(() =>
    this.accounts().filter((a) => a.id !== this.accountId()),
  );

  protected readonly isValid = computed(
    () =>
      this.otherAccountId() !== '' &&
      this.otherAccountId() !== this.accountId() &&
      cadenceEndDateError(this.cadenceOption(), this.cadenceFields()) === null,
  );

  constructor() {
    effect(() => {
      const transfer = this.transfer();
      const accountId = this.accountId();
      if (!transfer) return;

      this.direction.set(transfer.fromAccountId === accountId ? 'out' : 'in');
      this.otherAccountId.set(
        transfer.fromAccountId === accountId ? transfer.toAccountId : transfer.fromAccountId,
      );
      this.amount.set(transfer.amount);
      this.amountChanges.set(transfer.amountChanges ?? []);
      const { option, fields } = describeCadence(transfer.cadence);
      this.cadenceOption.set(option);
      this.cadenceFields.set(fields);
    });

    effect(() => {
      const otherAccounts = this.otherAccounts();
      if (this.otherAccountId() === '' && otherAccounts.length > 0) {
        this.otherAccountId.set(otherAccounts[0].id);
      }
    });
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    this.save();
  }

  protected save(): void {
    if (!this.isValid()) return;

    const id = this.transfer()?.id ?? crypto.randomUUID();
    const fromAccountId = this.direction() === 'out' ? this.accountId() : this.otherAccountId();
    const toAccountId = this.direction() === 'out' ? this.otherAccountId() : this.accountId();

    const built: Transfer = {
      id,
      fromAccountId,
      toAccountId,
      amount: this.amount(),
      cadence: buildCadence(this.cadenceOption(), this.cadenceFields()),
      amountChanges: this.amountChanges(),
    };

    this.saved.emit(built);
  }

  protected cancel(): void {
    this.cancelled.emit();
  }
}
