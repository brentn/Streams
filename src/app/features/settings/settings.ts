import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Account } from '../../core/models/account';
import { FileDownloadService } from '../../core/download/file-download';
import { serializeBackup } from '../../core/storage/backup-codec';
import { StorageRepository } from '../../core/storage/storage-repository';
import { BackupImport } from '../../shared/backup-import/backup-import';
import { StatusBanner } from '../../shared/status-banner/status-banner';
import { AccountRow } from './account-row/account-row';

@Component({
  selector: 'app-settings',
  imports: [StatusBanner, BackupImport, AccountRow],
  templateUrl: './settings.html',
  styleUrl: './settings.css',
})
export class Settings {
  private readonly storage = inject(StorageRepository);
  private readonly fileDownload = inject(FileDownloadService);
  private readonly router = inject(Router);

  protected readonly isExporting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly accounts = signal<Account[]>([]);
  protected readonly savingAccountId = signal<string | null>(null);

  /** Whichever operation last set `errorMessage`, so the status banner's Retry button has something to re-run. */
  private lastFailedAction: (() => Promise<void>) | null = null;

  constructor() {
    void this.loadAccounts();
  }

  private async loadAccounts(): Promise<void> {
    this.accounts.set(await this.storage.getAccounts());
  }

  protected async onAccountSaved(updated: Account): Promise<void> {
    this.savingAccountId.set(updated.id);
    this.errorMessage.set(null);
    try {
      await this.storage.upsertAccount(updated);
      this.accounts.update((accounts) => accounts.map((a) => (a.id === updated.id ? updated : a)));
    } catch (err) {
      this.lastFailedAction = () => this.onAccountSaved(updated);
      this.errorMessage.set(err instanceof Error ? err.message : 'Saving the account failed.');
    } finally {
      this.savingAccountId.set(null);
    }
  }

  protected async exportData(): Promise<void> {
    this.isExporting.set(true);
    this.errorMessage.set(null);
    try {
      const { dbVersion, stores } = await this.storage.exportAll();
      const json = serializeBackup({ dbVersion, exportedAt: new Date().toISOString(), stores });
      const filename = `streams-backup-${new Date().toISOString().slice(0, 10)}.json`;
      this.fileDownload.download(filename, json, 'application/json');
    } catch (err) {
      this.lastFailedAction = () => this.exportData();
      this.errorMessage.set(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      this.isExporting.set(false);
    }
  }

  protected onBackupImported(): void {
    void this.router.navigateByUrl('/accounts');
  }

  protected async retry(): Promise<void> {
    await this.lastFailedAction?.();
  }
}
