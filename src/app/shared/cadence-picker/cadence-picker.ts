import { Component, computed, input, output } from '@angular/core';
import { DayOfWeek, NthWeek } from '../../core/models/flow';
import {
  CADENCE_OPTIONS,
  cadenceEndDateError,
  CadenceFields,
  CadenceOption,
  needsAnchorDate,
  showsEndDate,
} from '../../core/projection/cadence-options';
import { dateInputValue, parseDateInput } from '../date-input';
import { numberInputValue } from '../number-input';

/** Abbreviated so all 7 fit the segmented control's single row at card width. */
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * The Cadence half of a recurring-kind Flow's or a Transfer's schedule — shared so both forms
 * get the same picker instead of duplicating the option/anchor-field wiring.
 */
@Component({
  selector: 'app-cadence-picker',
  templateUrl: './cadence-picker.html',
  styleUrl: './cadence-picker.css',
})
export class CadencePicker {
  readonly option = input.required<CadenceOption>();
  readonly fields = input.required<CadenceFields>();
  readonly optionChanged = output<CadenceOption>();
  readonly fieldsChanged = output<CadenceFields>();

  protected readonly cadenceOptions = CADENCE_OPTIONS;
  protected readonly needsAnchorDate = needsAnchorDate;
  protected readonly showsEndDate = showsEndDate;
  protected readonly dateInputValue = dateInputValue;
  protected readonly numberInputValue = numberInputValue;
  protected readonly endDateError = computed(() => cadenceEndDateError(this.option(), this.fields()));

  protected readonly daysOfMonth = Array.from({ length: 31 }, (_, i) => i + 1);

  protected readonly dayOfWeekOptions: { value: DayOfWeek; label: string }[] = DAY_NAMES.map(
    (label, value) => ({ value: value as DayOfWeek, label }),
  );

  /**
   * Semi-monthly's two anchor days rendered from the same calendar grid, dual-select: `day`
   * always holds the older pick, `day2` the newer, so a third pick can evict `day` without
   * needing separate order-tracking state beyond the two fields the domain model already has.
   */
  protected readonly selectedSemiMonthlyDays = computed(() => {
    const { day, day2 } = this.fields();
    return day === day2 ? [day] : [day, day2];
  });

  protected readonly nthOptions: { value: NthWeek; label: string }[] = [
    { value: 1, label: 'First' },
    { value: 2, label: 'Second' },
    { value: 3, label: 'Third' },
    { value: 4, label: 'Fourth' },
    { value: -1, label: 'Last' },
  ];

  protected updateField<K extends keyof CadenceFields>(key: K, value: CadenceFields[K]): void {
    this.fieldsChanged.emit({ ...this.fields(), [key]: value });
  }

  /** `day` is always the oldest pick, `day2` the newest — see `selectedSemiMonthlyDays` above. */
  protected toggleSemiMonthlyDay(clicked: number): void {
    const { day, day2 } = this.fields();
    const selected = this.selectedSemiMonthlyDays();

    if (selected.includes(clicked)) {
      const remaining = selected.find((d) => d !== clicked) ?? clicked;
      this.fieldsChanged.emit({ ...this.fields(), day: remaining, day2: remaining });
    } else if (selected.length < 2) {
      this.fieldsChanged.emit({ ...this.fields(), day: selected[0], day2: clicked });
    } else {
      this.fieldsChanged.emit({ ...this.fields(), day: day2, day2: clicked });
    }
  }

  protected onOptionChange(value: string): void {
    this.optionChanged.emit(value as CadenceOption);
  }

  protected onAnchorDateInput(value: string): void {
    this.updateField('anchorDate', parseDateInput(value));
  }

  protected onDateInput(value: string): void {
    this.updateField('date', parseDateInput(value));
  }

  protected onEndDateInput(value: string): void {
    this.updateField('endDate', value ? parseDateInput(value) : undefined);
  }

  /** `<select>` has no `valueAsNumber` (that's an `<input type="number">` property). */
  protected selectNumber(event: Event): number {
    return Number((event.target as HTMLSelectElement).value);
  }
}
