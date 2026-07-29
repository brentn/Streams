import { Component, computed, effect, input, output, signal } from '@angular/core';
import { Account } from '../../../core/models/account';
import { numberInputValue } from '../../../shared/number-input';

/**
 * Collects edits to one Account's locally-owned identity fields (name, institution name,
 * minimum) and emits a fully-built Account — it doesn't touch storage itself, mirroring
 * `FlowForm`. Minimum (the Dry Floor) doesn't apply to a liability Account, so its control is
 * hidden entirely rather than shown disabled or defaulted, and any local edit to it is ignored
 * on save.
 */
@Component({
  selector: 'app-account-row',
  imports: [],
  templateUrl: './account-row.html',
  styleUrl: './account-row.css',
})
export class AccountRow {
  readonly account = input.required<Account>();
  readonly isSaving = input(false);
  readonly saved = output<Account>();

  protected readonly name = signal('');
  protected readonly institutionName = signal('');
  protected readonly dryFloor = signal(0);

  protected readonly numberInputValue = numberInputValue;

  protected readonly isLiability = computed(() => this.account().expectedSign === -1);

  protected readonly isDirty = computed(() => {
    const account = this.account();
    const dryFloorDirty =
      !this.isLiability() && Number.isFinite(this.dryFloor()) && this.dryFloor() !== account.dryFloor;
    return (
      this.name().trim() !== account.name ||
      this.institutionName().trim() !== account.institutionName ||
      dryFloorDirty
    );
  });

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
    if (!this.isDirty()) return;
    const name = this.name().trim();
    const institutionName = this.institutionName().trim();
    if (!name || !institutionName) return;

    const account = this.account();
    this.saved.emit({
      ...account,
      name,
      institutionName,
      dryFloor: this.isLiability() ? account.dryFloor : this.dryFloor(),
    });
  }
}
