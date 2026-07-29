import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CdkListbox, CdkOption } from '@angular/cdk/listbox';
import { categorizeTransactions } from '../../core/categorization/categorization';
import { Account, Sign } from '../../core/models/account';
import { SimpleFinAdapter, SyncedAccount } from '../../core/simplefin/simplefin-adapter';
import { fetchNormalSyncWindow, reconcileSyncedAccounts } from '../../core/sync/resync-known-accounts';
import { StorageRepository } from '../../core/storage/storage-repository';
import { BackupImport } from '../../shared/backup-import/backup-import';
import { StatusBanner } from '../../shared/status-banner/status-banner';

type Step = 'connect' | 'confirm-signs';

@Component({
  selector: 'app-connect-account',
  imports: [StatusBanner, CdkListbox, CdkOption, BackupImport],
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

  /** Whichever operation last set `errorMessage`, so the status banner's Retry button has something to re-run. */
  private lastFailedAction: (() => Promise<void>) | null = null;

  protected readonly step = signal<Step>('connect');
  protected readonly pendingAccounts = signal<SyncedAccount[]>([]);
  protected readonly signChoices = signal<Record<string, Sign>>({});

  /** Detected once at load: an already-stored Access URL means this is a reconnect, not a first-time connect. Only changes copy — the flow (connect, reconcile known accounts, confirm signs for any new ones) is identical either way. */
  protected readonly isReauth = signal(false);

  protected readonly allSignsChosen = computed(() =>
    this.pendingAccounts().every((pending) => this.signChoices()[pending.account.id] !== undefined),
  );

  private accessUrl = '';

  constructor() {
    void this.storage.getAccessUrl().then((url) => this.isReauth.set(!!url));
  }

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
      const { synced } = await fetchNormalSyncWindow(this.storage, this.simplefin, this.accessUrl);
      const { newAccounts } = await reconcileSyncedAccounts(this.storage, synced);

      if (newAccounts.length === 0 || newAccounts.length < synced.length) {
        // Either nothing here needs sign confirmation (including a reauth whose response came
        // back empty) or at least one account was already known and got reconciled in place
        // above — either way, save the (possibly new, on reauth) Access URL now rather than
        // waiting on sign confirmation, which may not happen at all this time around.
        await this.storage.saveAccessUrl(this.accessUrl);
      }

      if (newAccounts.length === 0) {
        await this.router.navigateByUrl('/accounts');
        return;
      }

      this.pendingAccounts.set(newAccounts);
      this.signChoices.set({});
      this.step.set('confirm-signs');
    } catch (err) {
      this.lastFailedAction = () => this.connect();
      this.errorMessage.set(err instanceof Error ? err.message : 'Connection failed.');
    } finally {
      this.isConnecting.set(false);
    }
  }

  protected onBackupImported(): void {
    void this.router.navigateByUrl('/accounts');
  }

  protected async retry(): Promise<void> {
    await this.lastFailedAction?.();
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
