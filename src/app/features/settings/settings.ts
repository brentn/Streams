import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FileDownloadService } from '../../core/download/file-download';
import { serializeBackup } from '../../core/storage/backup-codec';
import { StorageRepository } from '../../core/storage/storage-repository';
import { BackupImport } from '../../shared/backup-import/backup-import';
import { StatusBanner } from '../../shared/status-banner/status-banner';

@Component({
  selector: 'app-settings',
  imports: [StatusBanner, BackupImport],
  templateUrl: './settings.html',
  styleUrl: './settings.css',
})
export class Settings {
  private readonly storage = inject(StorageRepository);
  private readonly fileDownload = inject(FileDownloadService);
  private readonly router = inject(Router);

  protected readonly isExporting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  /** Whichever operation last set `errorMessage`, so the status banner's Retry button has something to re-run. */
  private lastFailedAction: (() => Promise<void>) | null = null;

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
