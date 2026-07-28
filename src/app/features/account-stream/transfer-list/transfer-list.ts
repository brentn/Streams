import { CurrencyPipe } from '@angular/common';
import { Component, inject, input, output, signal } from '@angular/core';
import { Account } from '../../../core/models/account';
import { Transfer } from '../../../core/models/transfer';
import { CADENCE_OPTIONS, describeCadence } from '../../../core/projection/cadence-options';
import { StorageRepository } from '../../../core/storage/storage-repository';
import { TransferForm } from '../transfer-form/transfer-form';

/**
 * Renders whatever Transfers the parent hands it — same non-fetching pattern as FlowList, so
 * account-stream's canonical `transfers` signal stays the single source of truth.
 */
@Component({
  selector: 'app-transfer-list',
  imports: [CurrencyPipe, TransferForm],
  templateUrl: './transfer-list.html',
  styleUrl: './transfer-list.css',
})
export class TransferList {
  private readonly storage = inject(StorageRepository);

  readonly accountId = input.required<string>();
  readonly accounts = input.required<Account[]>();
  readonly transfers = input.required<Transfer[]>();
  readonly changed = output<void>();

  protected readonly isFormOpen = signal(false);
  protected readonly editingTransfer = signal<Transfer | null>(null);

  private accountName(id: string): string {
    return this.accounts().find((a) => a.id === id)?.name ?? 'Unknown Account';
  }

  protected summarize(transfer: Transfer): string {
    const { option } = describeCadence(transfer.cadence);
    const cadenceLabel = CADENCE_OPTIONS.find((o) => o.value === option)?.label ?? option;
    return transfer.fromAccountId === this.accountId()
      ? `Out, to ${this.accountName(transfer.toAccountId)} · ${cadenceLabel}`
      : `In, from ${this.accountName(transfer.fromAccountId)} · ${cadenceLabel}`;
  }

  protected openCreateForm(): void {
    this.editingTransfer.set(null);
    this.isFormOpen.set(true);
  }

  protected openEditForm(transfer: Transfer): void {
    this.editingTransfer.set(transfer);
    this.isFormOpen.set(true);
  }

  protected cancelForm(): void {
    this.isFormOpen.set(false);
  }

  protected async onTransferSaved(transfer: Transfer): Promise<void> {
    await this.storage.upsertTransfer(transfer);
    this.isFormOpen.set(false);
    this.changed.emit();
  }

  protected async remove(transfer: Transfer): Promise<void> {
    await this.storage.deleteTransfer(transfer.id);
    this.changed.emit();
  }
}
