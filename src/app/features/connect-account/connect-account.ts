import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { SimpleFinAdapter } from '../../core/simplefin/simplefin-adapter';
import { StorageRepository } from '../../core/storage/storage-repository';

@Component({
  selector: 'app-connect-account',
  templateUrl: './connect-account.html',
  styleUrl: './connect-account.css',
})
export class ConnectAccount {
  private readonly simplefin = inject(SimpleFinAdapter);
  private readonly storage = inject(StorageRepository);
  private readonly router = inject(Router);

  protected readonly setupToken = signal('');
  protected readonly isConnecting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected onSetupTokenInput(value: string): void {
    this.setupToken.set(value);
  }

  protected async connect(): Promise<void> {
    const token = this.setupToken().trim();
    if (!token) return;

    this.isConnecting.set(true);
    this.errorMessage.set(null);
    try {
      const accessUrl = await this.simplefin.claimAccessUrl(token);
      await this.storage.saveAccessUrl(accessUrl);

      const synced = await this.simplefin.fetchAccounts(accessUrl);

      for (const { account, transactions } of synced) {
        await this.storage.upsertAccount(account);
        await this.storage.upsertTransactions(transactions);
      }

      const firstAccountId = synced[0]?.account.id;
      if (firstAccountId) {
        await this.router.navigateByUrl(`/accounts/${firstAccountId}`);
      }
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Connection failed.');
    } finally {
      this.isConnecting.set(false);
    }
  }
}
