import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CdkListbox, CdkOption } from '@angular/cdk/listbox';
import { categorizeTransactions } from '../../core/categorization/categorization';
import { Account, Sign } from '../../core/models/account';
import { SimpleFinAdapter, SyncedAccount } from '../../core/simplefin/simplefin-adapter';
import { StorageRepository } from '../../core/storage/storage-repository';
import { StatusBanner } from '../../shared/status-banner/status-banner';

type Step = 'connect' | 'confirm-signs';

@Component({
  selector: 'app-connect-account',
  imports: [StatusBanner, CdkListbox, CdkOption],
  templateUrl: './connect-account.html',
  styleUrl: './connect-account.css',
})
export class ConnectAccount {
  private readonly simplefin = inject(SimpleFinAdapter);
  private readonly storage = inject(StorageRepository);
  private readonly router = inject(Router);

  protected readonly setupToken = signal('');
  protected readonly isConnecting = signal(false);
  protected readonly isSaving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly step = signal<Step>('connect');
  protected readonly pendingAccounts = signal<SyncedAccount[]>([]);
  protected readonly signChoices = signal<Record<string, Sign>>({});

  protected readonly allSignsChosen = computed(() =>
    this.pendingAccounts().every((pending) => this.signChoices()[pending.account.id] !== undefined),
  );

  private accessUrl = '';

  protected onSetupTokenInput(value: string): void {
    this.setupToken.set(value);
  }

  protected async connect(): Promise<void> {
    const token = this.setupToken().trim();
    if (!token) return;

    this.isConnecting.set(true);
    this.errorMessage.set(null);
    try {
      this.accessUrl = await this.simplefin.claimAccessUrl(token);
      const synced = await this.simplefin.fetchAccounts(this.accessUrl);

      this.pendingAccounts.set(synced);
      this.signChoices.set({});
      this.step.set('confirm-signs');
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Connection failed.');
    } finally {
      this.isConnecting.set(false);
    }
  }

  protected chooseSign(accountId: string, sign: Sign): void {
    this.signChoices.update((choices) => ({ ...choices, [accountId]: sign }));
  }

  protected async saveAndContinue(): Promise<void> {
    if (!this.allSignsChosen()) return;

    this.isSaving.set(true);
    this.errorMessage.set(null);
    try {
      await this.storage.saveAccessUrl(this.accessUrl);
      const choices = this.signChoices();
      const rules = await this.storage.getCategorizationRules();
      for (const { account, transactions } of this.pendingAccounts()) {
        const expectedSign = choices[account.id];
        const withSign: Account = { ...account, expectedSign, dryFloor: 0 };
        await this.storage.upsertAccount(withSign);
        await this.storage.upsertTransactions(categorizeTransactions(transactions, rules));
      }
      await this.router.navigateByUrl('/accounts');
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Saving failed.');
    } finally {
      this.isSaving.set(false);
    }
  }
}
