import { CurrencyPipe } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { Account } from '../../../core/models/account';
import { AccountForm } from '../account-form/account-form';

/**
 * Renders Accounts as a read-only list with an Edit button each; clicking Edit swaps that
 * one row's read-only content for `AccountForm` in place, leaving every other row untouched.
 * Settings owns which Account (if any) is being edited, plus the save/error handling; this
 * component only presents that state and forwards user actions upward.
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
}
