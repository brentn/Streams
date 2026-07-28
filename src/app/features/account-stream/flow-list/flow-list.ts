import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject, input, output, signal } from '@angular/core';
import { Flow } from '../../../core/models/flow';
import { Transaction } from '../../../core/models/transaction';
import { CADENCE_OPTIONS, describeCadence } from '../../../core/projection/cadence-options';
import { VarianceAlert, varianceAlert } from '../../../core/projection/projection-engine';
import { StorageRepository } from '../../../core/storage/storage-repository';
import { FlowForm } from '../flow-form/flow-form';

/**
 * Renders whatever Flows the parent hands it — it doesn't fetch its own copy.
 * `account-stream` owns the canonical `flows` signal for the whole page (also
 * driving the chart), so every view of an Account's Flows stays in sync
 * automatically instead of drifting when one is mutated somewhere else (e.g.
 * a Flow created inline from the transaction-categorization dialog).
 */
@Component({
  selector: 'app-flow-list',
  imports: [CurrencyPipe, DatePipe, FlowForm],
  templateUrl: './flow-list.html',
  styleUrl: './flow-list.css',
})
export class FlowList {
  private readonly storage = inject(StorageRepository);

  readonly accountId = input.required<string>();
  readonly flows = input.required<Flow[]>();
  readonly transactions = input<Transaction[]>([]);
  readonly changed = output<void>();

  protected readonly isFormOpen = signal(false);
  protected readonly editingFlow = signal<Flow | null>(null);

  /** Recomputed from whatever Transactions the parent hands down, so a Variance Alert appears/clears automatically as Transactions sync in and get categorized. */
  protected varianceAlertFor(flow: Flow): VarianceAlert | null {
    return varianceAlert(flow, this.transactions(), new Date());
  }

  protected summarize(flow: Flow): string {
    if (flow.kind === 'budget') {
      return `${flow.period === 'month' ? 'Monthly' : 'Annual'} budget`;
    }
    const { option } = describeCadence(flow.cadence);
    return CADENCE_OPTIONS.find((o) => o.value === option)?.label ?? option;
  }

  protected openCreateForm(): void {
    this.editingFlow.set(null);
    this.isFormOpen.set(true);
  }

  protected openEditForm(flow: Flow): void {
    this.editingFlow.set(flow);
    this.isFormOpen.set(true);
  }

  protected cancelForm(): void {
    this.isFormOpen.set(false);
  }

  protected async onFlowSaved(flow: Flow): Promise<void> {
    await this.storage.upsertFlow(flow);
    this.isFormOpen.set(false);
    this.changed.emit();
  }

  protected async remove(flow: Flow): Promise<void> {
    await this.storage.deleteFlow(flow.id);
    this.changed.emit();
  }
}
