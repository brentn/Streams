import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { computed, inject, signal } from '@angular/core';
import { AmountChange, BudgetPeriod, DayOfWeek, FlowDirection, FlowKind } from '../../../core/models/flow';
import { numberInputValue } from '../../../shared/number-input';
import { AmountChangeSubModal, AmountChangeSubModalData } from './amount-change-sub-modal';

export type CadenceShape = 'monthly' | 'semi-monthly' | 'weekly';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * PROTOTYPE — wayfinder ticket #53 (https://github.com/brentn/Streams/issues/53).
 *
 * Shared state/behavior for the three "categorization dialog redesign" variants. This is
 * NOT the real FlowForm — cadence is simplified to monthly/semi-monthly/weekly (the real
 * form's other six cadence options are unaffected by this ticket and would just be noise
 * here).
 * The question this prototype answers is the shape of the four redesign asks: a scrollable
 * dialog, step-change/recurring-rule hidden behind badge buttons opening sub-modals,
 * click-to-edit tolerance defaulting to 10%, and radio-button day selection.
 */
export abstract class FlowFormPrototypeBase {
  private readonly dialog = inject(Dialog);
  private readonly dialogRef = inject(DialogRef<void>);

  protected readonly name = signal('ACME Utilities');
  protected readonly direction = signal<FlowDirection>('out');
  protected readonly kind = signal<FlowKind>('recurring');
  protected readonly amount = signal(42.17);
  protected readonly budgetPeriod = signal<BudgetPeriod>('month');

  protected readonly cadenceShape = signal<CadenceShape>('monthly');
  protected readonly dayOfMonth = signal(15);
  protected readonly dayOfWeek = signal<DayOfWeek>(5);
  protected readonly daysOfMonth = Array.from({ length: 31 }, (_, i) => i + 1);

  /**
   * Semi-monthly's two anchor days, picked from a single grid rather than two separate
   * pickers (per wayfinder ticket #53 discussion): clicking an unselected day adds it,
   * evicting the oldest pick once two are already set; clicking a selected day removes it.
   */
  protected readonly semiMonthlyDays = signal<number[]>([1, 15]);
  protected readonly sortedSemiMonthlyDays = computed(() =>
    [...this.semiMonthlyDays()].sort((a, b) => a - b),
  );
  protected readonly dayOfWeekOptions: { value: DayOfWeek; label: string }[] = DAY_NAMES.map(
    (label, value) => ({ value: value as DayOfWeek, label }),
  );

  protected readonly toleranceKind = signal<'percent' | 'fixed'>('percent');
  protected readonly toleranceValue = signal(10);
  protected readonly isEditingTolerance = signal(false);
  protected readonly toleranceDisplay = computed(() =>
    this.toleranceKind() === 'percent' ? `${this.toleranceValue()}%` : `$${this.toleranceValue()}`,
  );

  protected readonly amountChanges = signal<AmountChange[]>([]);
  protected readonly stepChangeCount = computed(
    () => this.amountChanges().filter((c) => c.type === 'step').length,
  );
  protected readonly recurringRuleCount = computed(
    () => this.amountChanges().filter((c) => c.type === 'recurring-rule').length,
  );

  protected readonly numberInputValue = numberInputValue;

  protected toggleSemiMonthlyDay(day: number): void {
    this.semiMonthlyDays.update((days) => {
      if (days.includes(day)) return days.filter((d) => d !== day);
      return days.length < 2 ? [...days, day] : [days[1], day];
    });
  }

  protected startEditingTolerance(): void {
    this.isEditingTolerance.set(true);
  }

  protected commitTolerance(): void {
    this.isEditingTolerance.set(false);
  }

  protected openAmountChangeModal(mode: 'step' | 'recurring'): void {
    const ref = this.dialog.open<AmountChange[]>(AmountChangeSubModal, {
      data: { mode, changes: this.amountChanges() } satisfies AmountChangeSubModalData,
    });
    ref.closed.subscribe((result) => {
      if (result) this.amountChanges.set(result);
    });
  }

  protected save(): void {
    // PROTOTYPE — no persistence; log the shape a real save would produce.
    console.log('[prototype #53] would save', {
      name: this.name(),
      direction: this.direction(),
      kind: this.kind(),
      amount: this.amount(),
      tolerance: { kind: this.toleranceKind(), value: this.toleranceValue() },
      amountChanges: this.amountChanges(),
    });
    this.dialogRef.close();
  }

  protected cancel(): void {
    this.dialogRef.close();
  }
}
