import { DialogRef } from '@angular/cdk/dialog';
import { Component, inject, signal } from '@angular/core';
import { addDays, normalizeDay, SCRUB_MAX_DAYS, SCRUB_MIN_DAYS } from '../../core/charting/date-window';
import { dateInputValue, parseDateInput } from '../date-input';

/**
 * Opened by clicking the calendar chip. Always defaults to today, independent of the caller's
 * current scrub position — Today re-confirms that default immediately, Go applies whatever the
 * input has been changed to.
 */
@Component({
  selector: 'app-date-picker-dialog',
  templateUrl: './date-picker-dialog.html',
  styleUrl: './date-picker-dialog.css',
})
export class DatePickerDialog {
  private readonly dialogRef = inject(DialogRef<Date>);

  private readonly today = normalizeDay(new Date());
  protected readonly pendingDate = signal(this.today);

  protected readonly minValue = dateInputValue(addDays(this.today, SCRUB_MIN_DAYS));
  protected readonly maxValue = dateInputValue(addDays(this.today, SCRUB_MAX_DAYS));

  protected readonly dateInputValue = dateInputValue;

  protected onDateInput(value: string): void {
    this.pendingDate.set(parseDateInput(value));
  }

  protected go(): void {
    this.dialogRef.close(this.pendingDate());
  }

  protected useToday(): void {
    this.dialogRef.close(this.today);
  }

  protected cancel(): void {
    this.dialogRef.close();
  }
}
