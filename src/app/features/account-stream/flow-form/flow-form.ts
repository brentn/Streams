import { Component, computed, effect, input, output, signal } from '@angular/core';
import {
  AmountChange,
  BudgetFlow,
  BudgetPeriod,
  Flow,
  FlowDirection,
  FlowKind,
  RecurringFlow,
  Tolerance,
} from '../../../core/models/flow';
import {
  buildCadence,
  cadenceEndDateError,
  CadenceFields,
  CadenceOption,
  defaultCadenceFields,
  describeCadence,
} from '../../../core/projection/cadence-options';
import { AmountRuleBadges } from '../../../shared/amount-rule-badges/amount-rule-badges';
import { CadencePicker } from '../../../shared/cadence-picker/cadence-picker';
import { numberInputValue } from '../../../shared/number-input';

/**
 * Collects a Flow's fields and emits a fully-built Flow object — it doesn't
 * touch storage itself, so callers with different post-save needs (FlowList
 * persists and reloads its list; AssignFlowDialog persists later, once the
 * Transaction it's being created for is actually saved) share this one form
 * without either dictating the other's behavior.
 */
@Component({
  selector: 'app-flow-form',
  imports: [CadencePicker, AmountRuleBadges],
  templateUrl: './flow-form.html',
  styleUrl: './flow-form.css',
})
export class FlowForm {
  readonly accountId = input.required<string>();
  readonly flow = input<Flow | null>(null);
  readonly saved = output<Flow>();
  readonly cancelled = output<void>();
  readonly deleted = output<void>();

  protected readonly name = signal('');
  protected readonly direction = signal<FlowDirection>('out');
  protected readonly kind = signal<FlowKind>('recurring');
  protected readonly amount = signal(0);
  protected readonly cadenceOption = signal<CadenceOption>('monthly');
  protected readonly cadenceFields = signal<CadenceFields>(defaultCadenceFields());
  protected readonly budgetPeriod = signal<BudgetPeriod>('month');

  protected readonly amountChanges = signal<AmountChange[]>([]);

  /** Defaults to 10% per the categorization-dialog redesign — every Flow gets Tolerance-checked unless the user changes it. */
  protected readonly toleranceKind = signal<'percent' | 'fixed'>('percent');
  protected readonly toleranceValue = signal(10);
  protected readonly isEditingTolerance = signal(false);
  protected readonly isConfirmingDelete = signal(false);
  protected readonly toleranceDisplay = computed(() =>
    this.toleranceKind() === 'percent' ? `${this.toleranceValue()}%` : `$${this.toleranceValue()}`,
  );

  protected readonly numberInputValue = numberInputValue;

  protected readonly isValid = computed(
    () => this.kind() !== 'recurring' || cadenceEndDateError(this.cadenceOption(), this.cadenceFields()) === null,
  );

  constructor() {
    effect(() => {
      const flow = this.flow();
      if (!flow) return;
      this.name.set(flow.name);
      this.direction.set(flow.direction);
      this.kind.set(flow.kind);
      this.amountChanges.set(flow.amountChanges ?? []);
      this.toleranceKind.set(flow.tolerance?.kind ?? 'percent');
      this.toleranceValue.set(flow.tolerance?.value ?? 10);
      if (flow.kind === 'recurring') {
        this.amount.set(flow.amount);
        const { option, fields } = describeCadence(flow.cadence);
        this.cadenceOption.set(option);
        this.cadenceFields.set(fields);
      } else {
        this.amount.set(flow.limit);
        this.budgetPeriod.set(flow.period);
      }
    });
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    this.save();
  }

  protected startEditingTolerance(): void {
    this.isEditingTolerance.set(true);
  }

  protected commitTolerance(): void {
    this.isEditingTolerance.set(false);
  }

  protected save(): void {
    if (!this.isValid()) return;

    const id = this.flow()?.id ?? crypto.randomUUID();
    const tolerance: Tolerance = { kind: this.toleranceKind(), value: this.toleranceValue() };
    const base = {
      id,
      accountId: this.accountId(),
      name: this.name().trim(),
      direction: this.direction(),
      tolerance,
    };

    const flow: Flow =
      this.kind() === 'recurring'
        ? ({
            ...base,
            kind: 'recurring',
            amount: this.amount(),
            cadence: buildCadence(this.cadenceOption(), this.cadenceFields()),
            amountChanges: this.amountChanges(),
          } satisfies RecurringFlow)
        : ({
            ...base,
            kind: 'budget',
            limit: this.amount(),
            period: this.budgetPeriod(),
            amountChanges: this.amountChanges(),
          } satisfies BudgetFlow);

    this.saved.emit(flow);
  }

  protected cancel(): void {
    this.cancelled.emit();
  }

  protected startDelete(): void {
    this.isConfirmingDelete.set(true);
  }

  protected cancelDelete(): void {
    this.isConfirmingDelete.set(false);
  }

  protected confirmDelete(): void {
    this.deleted.emit();
  }
}
