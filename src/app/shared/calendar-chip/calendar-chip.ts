import { Dialog } from '@angular/cdk/dialog';
import { Component, computed, inject, input, output } from '@angular/core';
import { DatePickerDialog } from '../date-picker-dialog/date-picker-dialog';

/**
 * Owns opening DatePickerDialog itself, rather than leaving that to whichever view embeds it —
 * both account-stream and multi-account-stream need the exact same click-to-pick-a-date
 * behavior, so centralizing it here avoids re-duplicating dialog.open() in each.
 */
@Component({
  selector: 'app-calendar-chip',
  templateUrl: './calendar-chip.html',
  styleUrl: './calendar-chip.css',
})
export class CalendarChip {
  private readonly dialog = inject(Dialog);

  readonly date = input.required<Date>();
  readonly dateSelected = output<Date>();

  protected readonly month = computed(() =>
    this.date().toLocaleString(undefined, { month: 'short' }).toUpperCase(),
  );
  protected readonly day = computed(() => this.date().getDate());
  protected readonly showYear = computed(() => this.date().getFullYear() !== new Date().getFullYear());
  protected readonly year = computed(() => this.date().getFullYear());

  protected openDatePicker(): void {
    const ref = this.dialog.open<Date>(DatePickerDialog);
    ref.closed.subscribe((date) => {
      if (date) this.dateSelected.emit(date);
    });
  }
}
