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

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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
  protected readonly endDateError = computed(() => cadenceEndDateError(this.option(), this.fields()));

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

  protected updateField<K extends keyof CadenceFields>(key: K, value: CadenceFields[K]): void {
    this.fieldsChanged.emit({ ...this.fields(), [key]: value });
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
