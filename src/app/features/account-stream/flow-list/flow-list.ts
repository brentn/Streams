import { CurrencyPipe } from '@angular/common';
import { Component, effect, inject, input, output, signal } from '@angular/core';
import {
  BudgetFlow,
  BudgetPeriod,
  DayOfWeek,
  Flow,
  FlowDirection,
  FlowKind,
  NthWeek,
  RecurringFlow,
} from '../../../core/models/flow';
import {
  buildCadence,
  CADENCE_OPTIONS,
  CadenceFields,
  CadenceOption,
  defaultCadenceFields,
  describeCadence,
  needsAnchorDate,
} from '../../../core/projection/cadence-options';
import { StorageRepository } from '../../../core/storage/storage-repository';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

@Component({
  selector: 'app-flow-list',
  imports: [CurrencyPipe],
  templateUrl: './flow-list.html',
  styleUrl: './flow-list.css',
})
export class FlowList {
  private readonly storage = inject(StorageRepository);

  readonly accountId = input.required<string>();
  readonly changed = output<void>();

  protected readonly flows = signal<Flow[]>([]);
  protected readonly isFormOpen = signal(false);
  protected readonly editingFlowId = signal<string | null>(null);

  protected readonly name = signal('');
  protected readonly direction = signal<FlowDirection>('out');
  protected readonly kind = signal<FlowKind>('recurring');
  protected readonly amount = signal(0);
  protected readonly cadenceOption = signal<CadenceOption>('monthly');
  protected readonly cadenceFields = signal<CadenceFields>(defaultCadenceFields());
  protected readonly budgetPeriod = signal<BudgetPeriod>('month');

  protected readonly dayNames = DAY_NAMES;
  protected readonly cadenceOptions = CADENCE_OPTIONS;

  constructor() {
    effect(() => {
      void this.load(this.accountId());
    });
  }

  protected summarize(flow: Flow): string {
    if (flow.kind === 'budget') {
      return `${flow.period === 'month' ? 'Monthly' : 'Annual'} budget`;
    }
    const { option } = describeCadence(flow.cadence);
    return CADENCE_OPTIONS.find((o) => o.value === option)?.label ?? option;
  }

  private async load(accountId: string): Promise<void> {
    this.flows.set(await this.storage.getFlowsForAccount(accountId));
  }

  protected openCreateForm(): void {
    this.editingFlowId.set(null);
    this.name.set('');
    this.direction.set('out');
    this.kind.set('recurring');
    this.amount.set(0);
    this.cadenceOption.set('monthly');
    this.cadenceFields.set(defaultCadenceFields());
    this.budgetPeriod.set('month');
    this.isFormOpen.set(true);
  }

  protected openEditForm(flow: Flow): void {
    this.editingFlowId.set(flow.id);
    this.name.set(flow.name);
    this.direction.set(flow.direction);
    this.kind.set(flow.kind);
    if (flow.kind === 'recurring') {
      this.amount.set(flow.amount);
      const { option, fields } = describeCadence(flow.cadence);
      this.cadenceOption.set(option);
      this.cadenceFields.set(fields);
    } else {
      this.amount.set(flow.limit);
      this.budgetPeriod.set(flow.period);
    }
    this.isFormOpen.set(true);
  }

  protected cancelForm(): void {
    this.isFormOpen.set(false);
  }

  protected updateCadenceField<K extends keyof CadenceFields>(key: K, value: CadenceFields[K]): void {
    this.cadenceFields.update((fields) => ({ ...fields, [key]: value }));
  }

  protected dateInputValue(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  protected onAnchorDateInput(value: string): void {
    const [year, month, day] = value.split('-').map(Number);
    this.updateCadenceField('anchorDate', new Date(year, month - 1, day));
  }

  /** `<select>` has no `valueAsNumber` (that's an `<input type="number">` property). */
  protected selectNumber(event: Event): number {
    return Number((event.target as HTMLSelectElement).value);
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    void this.save();
  }

  protected async save(): Promise<void> {
    const id = this.editingFlowId() ?? crypto.randomUUID();
    const base = {
      id,
      accountId: this.accountId(),
      name: this.name().trim(),
      direction: this.direction(),
    };

    const flow: Flow =
      this.kind() === 'recurring'
        ? ({
            ...base,
            kind: 'recurring',
            amount: this.amount(),
            cadence: buildCadence(this.cadenceOption(), this.cadenceFields()),
          } satisfies RecurringFlow)
        : ({
            ...base,
            kind: 'budget',
            limit: this.amount(),
            period: this.budgetPeriod(),
          } satisfies BudgetFlow);

    await this.storage.upsertFlow(flow);
    await this.load(this.accountId());
    this.isFormOpen.set(false);
    this.changed.emit();
  }

  protected async remove(flow: Flow): Promise<void> {
    await this.storage.deleteFlow(flow.id);
    await this.load(this.accountId());
    this.changed.emit();
  }

  protected readonly dayOfWeekOptions: { value: DayOfWeek; label: string }[] = DAY_NAMES.map(
    (label, value) => ({ value: value as DayOfWeek, label }),
  );

  protected readonly nthOptions: { value: NthWeek; label: string }[] = [
    { value: 1, label: 'First' },
    { value: 2, label: 'Second' },
    { value: 3, label: 'Third' },
    { value: 4, label: 'Fourth' },
    { value: -1, label: 'Last' },
  ];

  protected readonly needsAnchorDate = needsAnchorDate;
}
