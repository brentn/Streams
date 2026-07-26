import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { Account } from '../../core/models/account';
import { Transaction } from '../../core/models/transaction';
import { balanceAtDate } from '../../core/projection/projection-engine';
import { SimpleFinAdapter } from '../../core/simplefin/simplefin-adapter';
import { StorageRepository } from '../../core/storage/storage-repository';

const SCRUB_MIN_DAYS = -365;
const SCRUB_MAX_DAYS = 180;

@Component({
  selector: 'app-account-stream',
  imports: [CurrencyPipe, DatePipe],
  templateUrl: './account-stream.html',
  styleUrl: './account-stream.css',
})
export class AccountStream {
  private readonly storage = inject(StorageRepository);
  private readonly simplefin = inject(SimpleFinAdapter);

  readonly id = input.required<string>();

  protected readonly scrubMin = SCRUB_MIN_DAYS;
  protected readonly scrubMax = SCRUB_MAX_DAYS;

  protected readonly account = signal<Account | null>(null);
  protected readonly transactions = signal<Transaction[]>([]);
  protected readonly dayOffset = signal(0);
  protected readonly isSyncing = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly selectedDate = computed(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + this.dayOffset());
    return date;
  });

  protected readonly balance = computed(() => {
    const account = this.account();
    return account ? balanceAtDate(account, this.transactions(), this.selectedDate()) : null;
  });

  protected readonly isActual = computed(() => {
    const account = this.account();
    return account ? this.selectedDate().getTime() <= account.balanceDate.getTime() : false;
  });

  constructor() {
    effect(() => {
      void this.load(this.id());
    });
  }

  protected async load(id: string): Promise<void> {
    const accounts = await this.storage.getAccounts();
    const account = accounts.find((a) => a.id === id) ?? null;
    this.account.set(account);
    this.transactions.set(account ? await this.storage.getTransactionsForAccount(id) : []);
  }

  protected shiftDay(delta: number): void {
    this.dayOffset.update((offset) =>
      Math.min(this.scrubMax, Math.max(this.scrubMin, offset + delta)),
    );
  }

  protected onScrub(value: string): void {
    this.dayOffset.set(Number(value));
  }

  protected async resync(): Promise<void> {
    this.isSyncing.set(true);
    this.errorMessage.set(null);
    try {
      const accessUrl = await this.storage.getAccessUrl();
      if (!accessUrl) {
        throw new Error('No SimpleFIN connection found.');
      }
      const synced = await this.simplefin.fetchAccounts(accessUrl);
      for (const { account, transactions } of synced) {
        await this.storage.upsertAccount(account);
        await this.storage.upsertTransactions(transactions);
      }
      await this.load(this.id());
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Re-sync failed.');
    } finally {
      this.isSyncing.set(false);
    }
  }
}
