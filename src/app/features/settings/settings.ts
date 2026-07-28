import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FileDownloadService } from '../../core/download/file-download';
import { Backup, deserializeBackup, serializeBackup } from '../../core/storage/backup-codec';
import { StorageRepository } from '../../core/storage/storage-repository';
import { StatusBanner } from '../../shared/status-banner/status-banner';

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file.'));
    reader.readAsText(file);
  });
}

@Component({
  selector: 'app-settings',
  imports: [StatusBanner],
  templateUrl: './settings.html',
  styleUrl: './settings.css',
})
export class Settings {
  private readonly storage = inject(StorageRepository);
  private readonly fileDownload = inject(FileDownloadService);
  private readonly router = inject(Router);

  protected readonly isExporting = signal(false);
  protected readonly isImporting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly pendingImport = signal<Backup | null>(null);

  /** Whichever operation last set `errorMessage`, so the status banner's Retry button has something to re-run. */
  private lastFailedAction: (() => Promise<void>) | null = null;

  protected readonly storeSummary = computed(() => {
    const backup = this.pendingImport();
    if (!backup) return [];
    return Object.entries(backup.stores).map(([name, records]) => ({
      name,
      count: records.length,
    }));
  });

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

  protected onFileInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) void this.onFileSelected(file);
  }

  protected async onFileSelected(file: File): Promise<void> {
    this.errorMessage.set(null);
    try {
      const text = await readFileAsText(file);
      this.pendingImport.set(deserializeBackup(text));
    } catch (err) {
      this.pendingImport.set(null);
      this.lastFailedAction = () => this.onFileSelected(file);
      this.errorMessage.set(err instanceof Error ? err.message : 'Import failed.');
    }
  }

  protected cancelImport(): void {
    this.pendingImport.set(null);
  }

  protected async confirmImport(): Promise<void> {
    const backup = this.pendingImport();
    if (!backup) return;

    this.isImporting.set(true);
    this.errorMessage.set(null);
    try {
      await this.storage.importAll(backup.stores);
      this.pendingImport.set(null);
      await this.router.navigateByUrl('/accounts');
    } catch (err) {
      this.lastFailedAction = () => this.confirmImport();
      this.errorMessage.set(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      this.isImporting.set(false);
    }
  }

  protected async retry(): Promise<void> {
    await this.lastFailedAction?.();
  }
}
