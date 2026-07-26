import { Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-calendar-chip',
  templateUrl: './calendar-chip.html',
  styleUrl: './calendar-chip.css',
})
export class CalendarChip {
  readonly date = input.required<Date>();

  protected readonly month = computed(() =>
    this.date().toLocaleString(undefined, { month: 'short' }).toUpperCase(),
  );
  protected readonly day = computed(() => this.date().getDate());
  protected readonly showYear = computed(() => this.date().getFullYear() !== new Date().getFullYear());
  protected readonly year = computed(() => this.date().getFullYear());
}
