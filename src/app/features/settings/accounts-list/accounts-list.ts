import { CurrencyPipe } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { Account } from '../../../core/models/account';
import { AccountForm } from '../account-form/account-form';

/**
 * Renders Accounts as a read-only list with an Edit button each, revealing
 * `AccountForm` for at most one Account at a time — mirrors `FlowList`'s list+form split
 * so both entity lists in the app share one interaction shape. Settings owns which Account
 * (if any) is being edited, plus the save/error handling; this component only presents
 * that state and forwards user actions upward.
 */
@Component({
  selector: 'app-accounts-list',
  imports: [CurrencyPipe, AccountForm],
  templateUrl: './accounts-list.html',
  styleUrl: './accounts-list.css',
})
export class AccountsList {
  readonly accounts = input.required<Account[]>();
  readonly editingAccountId = input<string | null>(null);
  readonly savingAccountId = input<string | null>(null);

  readonly edit = output<string>();
  readonly cancel = output<void>();
  readonly saved = output<Account>();

  protected readonly editingAccount = computed(
    () => this.accounts().find((a) => a.id === this.editingAccountId()) ?? null,
  );
}
