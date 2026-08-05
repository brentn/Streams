import { Component, computed, ElementRef, input, output, viewChild } from '@angular/core';
import { addDays, normalizeDay, SCRUB_MAX_DAYS, SCRUB_MIN_DAYS } from '../../core/charting/date-window';
import { dateInputValue, parseDateInput } from '../date-input';

/**
 * The chip triggers a hidden native date input's own browser picker directly (via showPicker())
 * rather than a custom modal — one click shows the calendar with no intermediate step.
 *
 * `interactive` defaults to true for the account-stream/multi-account-stream scrubber views;
 * `outstanding-flow-row` embeds this chip as a plain read-only date badge inside its own clickable
 * tile, so it opts out — a clickable picker nested in there would fire on top of (and be confused
 * with) the tile's click.
 */
@Component({
  selector: 'app-calendar-chip',
  templateUrl: './calendar-chip.html',
  styleUrl: './calendar-chip.css',
})
export class CalendarChip {
  readonly date = input.required<Date>();
  readonly interactive = input(true);
  readonly dateSelected = output<Date>();

  private readonly dateInput = viewChild('dateInput', { read: ElementRef<HTMLInputElement> });

  protected readonly month = computed(() =>
    this.date().toLocaleString(undefined, { month: 'short' }).toUpperCase(),
  );
  protected readonly day = computed(() => this.date().getDate());
  protected readonly showYear = computed(() => this.date().getFullYear() !== new Date().getFullYear());
  protected readonly year = computed(() => this.date().getFullYear());

  protected readonly dateInputValue = dateInputValue;

  // Plain methods, not memoized fields — this component can stay mounted for a long-lived
  // session, and a frozen `new Date()` from construction time would silently go stale.
  protected minValue(): string {
    return dateInputValue(addDays(normalizeDay(new Date()), SCRUB_MIN_DAYS));
  }

  protected maxValue(): string {
    return dateInputValue(addDays(normalizeDay(new Date()), SCRUB_MAX_DAYS));
  }

  protected openPicker(): void {
    const input = this.dateInput()?.nativeElement;
    if (!input) return;
    try {
      input.showPicker();
    } catch {
      input.focus();
    }
  }

  protected onInputChange(value: string): void {
    this.dateSelected.emit(parseDateInput(value));
  }
}
