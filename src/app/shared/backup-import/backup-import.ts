import { Component, computed, inject, output, signal } from '@angular/core';
import { readFileAsText } from '../../core/download/read-file-as-text';
import { Backup, deserializeBackup } from '../../core/storage/backup-codec';
import { StorageRepository } from '../../core/storage/storage-repository';
import { StatusBanner } from '../status-banner/status-banner';

/** Self-contained "pick a backup file, review what's in it, confirm the restore" flow, shared by Settings and the connect screen so neither reimplements storage.importAll/deserializeBackup. */
@Component({
  selector: 'app-backup-import',
  imports: [StatusBanner],
  templateUrl: './backup-import.html',
  styleUrl: './backup-import.css',
})
export class BackupImport {
  private readonly storage = inject(StorageRepository);

  readonly imported = output<void>();

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
      this.imported.emit();
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
