import { Component, computed, effect, input, output, signal } from '@angular/core';
import { Account } from '../../../core/models/account';
import { numberInputValue } from '../../../shared/number-input';

/**
 * Collects edits to one Account's locally-owned identity fields (name, institution name,
 * minimum) and emits a fully-built Account on save, or `cancelled` to discard them — it
 * doesn't touch storage itself, mirroring `FlowForm`'s shape (Save gated on validity, not
 * on whether anything actually changed). Minimum (the Dry Floor) doesn't apply to a liability
 * Account, so its control is hidden entirely rather than shown disabled or defaulted, and any
 * local edit to it is ignored on save. Renders with no card chrome of its own (see
 * account-form.css) — it's only ever embedded inside `AccountsList`'s own row card, which
 * supplies the border/background; a future standalone use would need that restored.
 */
@Component({
  selector: 'app-account-form',
  imports: [],
  templateUrl: './account-form.html',
  styleUrl: './account-form.css',
})
export class AccountForm {
  readonly account = input.required<Account>();
  readonly isSaving = input(false);
  readonly saved = output<Account>();
  readonly cancelled = output<void>();

  protected readonly name = signal('');
  protected readonly institutionName = signal('');
  protected readonly dryFloor = signal(0);

  protected readonly numberInputValue = numberInputValue;

  protected readonly isLiability = computed(() => this.account().expectedSign === -1);

  protected readonly isValid = computed(
    () => this.name().trim() !== '' && this.institutionName().trim() !== '',
  );

  constructor() {
    effect(() => {
      const account = this.account();
      this.name.set(account.name);
      this.institutionName.set(account.institutionName);
      this.dryFloor.set(account.dryFloor);
    });
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    this.save();
  }

  protected save(): void {
    if (!this.isValid()) return;
    const account = this.account();
    this.saved.emit({
      ...account,
      name: this.name().trim(),
      institutionName: this.institutionName().trim(),
      dryFloor: this.isLiability() ? account.dryFloor : this.dryFloor(),
    });
  }

  protected cancel(): void {
    this.cancelled.emit();
  }
}
