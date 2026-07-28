import { Component, effect, input, output, signal } from '@angular/core';
import {
  AmountChange,
  BudgetFlow,
  BudgetPeriod,
  DayOfWeek,
  Flow,
  FlowDirection,
  FlowKind,
  NthWeek,
  RecurringFlow,
  RecurringRule,
  StepChange,
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

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Collects a Flow's fields and emits a fully-built Flow object — it doesn't
 * touch storage itself, so callers with different post-save needs (FlowList
 * persists and reloads its list; AssignFlowDialog persists later, once the
 * Transaction it's being created for is actually saved) share this one form
 * without either dictating the other's behavior.
 */
@Component({
  selector: 'app-flow-form',
  templateUrl: './flow-form.html',
  styleUrl: './flow-form.css',
})
export class FlowForm {
  readonly accountId = input.required<string>();
  readonly flow = input<Flow | null>(null);
  readonly saved = output<Flow>();
  readonly cancelled = output<void>();

  protected readonly name = signal('');
  protected readonly direction = signal<FlowDirection>('out');
  protected readonly kind = signal<FlowKind>('recurring');
  protected readonly amount = signal(0);
  protected readonly cadenceOption = signal<CadenceOption>('monthly');
  protected readonly cadenceFields = signal<CadenceFields>(defaultCadenceFields());
  protected readonly budgetPeriod = signal<BudgetPeriod>('month');

  protected readonly amountChanges = signal<AmountChange[]>([]);
  protected readonly newStepDate = signal(new Date());
  protected readonly newStepAmount = signal(0);
  protected readonly newRuleDate = signal(new Date());
  protected readonly newRuleDelta = signal(0);

  protected readonly dayNames = DAY_NAMES;
  protected readonly cadenceOptions = CADENCE_OPTIONS;

  constructor() {
    effect(() => {
      const flow = this.flow();
      if (!flow) return;
      this.name.set(flow.name);
      this.direction.set(flow.direction);
      this.kind.set(flow.kind);
      this.amountChanges.set(flow.amountChanges ?? []);
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

  protected updateCadenceField<K extends keyof CadenceFields>(key: K, value: CadenceFields[K]): void {
    this.cadenceFields.update((fields) => ({ ...fields, [key]: value }));
  }

  protected dateInputValue(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private static parseDateInput(value: string): Date {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  protected onAnchorDateInput(value: string): void {
    this.updateCadenceField('anchorDate', FlowForm.parseDateInput(value));
  }

  protected onNewStepDateInput(value: string): void {
    this.newStepDate.set(FlowForm.parseDateInput(value));
  }

  protected onNewRuleDateInput(value: string): void {
    this.newRuleDate.set(FlowForm.parseDateInput(value));
  }

  protected addStepChange(): void {
    const change: StepChange = {
      type: 'step',
      effectiveDate: this.newStepDate(),
      amount: this.newStepAmount(),
    };
    this.amountChanges.update((changes) => [...changes, change]);
    this.newStepAmount.set(0);
  }

  protected addRecurringRule(): void {
    const rule: RecurringRule = {
      type: 'recurring-rule',
      anniversaryDate: this.newRuleDate(),
      delta: this.newRuleDelta(),
    };
    this.amountChanges.update((changes) => [...changes, rule]);
    this.newRuleDelta.set(0);
  }

  protected removeAmountChange(index: number): void {
    this.amountChanges.update((changes) => changes.filter((_, i) => i !== index));
  }

  protected describeAmountChange(change: AmountChange): string {
    return change.type === 'step'
      ? `Step Change to ${change.amount} from ${this.dateInputValue(change.effectiveDate)}`
      : `Recurring Rule: ${change.delta >= 0 ? '+' : ''}${change.delta} every ${this.dateInputValue(change.anniversaryDate)}`;
  }

  /** `<select>` has no `valueAsNumber` (that's an `<input type="number">` property). */
  protected selectNumber(event: Event): number {
    return Number((event.target as HTMLSelectElement).value);
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    this.save();
  }

  protected save(): void {
    const id = this.flow()?.id ?? crypto.randomUUID();
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
