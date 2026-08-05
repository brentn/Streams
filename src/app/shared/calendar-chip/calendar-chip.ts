import { Component, computed, input, output } from '@angular/core';
import { addDays, normalizeDay, SCRUB_MAX_DAYS, SCRUB_MIN_DAYS } from '../../core/charting/date-window';
import { dateInputValue, parseDateInput } from '../date-input';

/**
 * The chip's calendar visual is purely decorative — a real `<input type="date">` is overlaid
 * on top of it (invisible, but genuinely clickable/tappable, not `pointer-events: none`) so a
 * direct click or tap on the chip lands on the input itself. That's deliberate: iOS Safari only
 * ever opens its native date picker from a real user gesture landing directly on the input —
 * `showPicker()` isn't implemented there for `type="date"` at all (WebKit bug 261703), so a
 * hidden, non-interactive overlay triggered by a separate button (the previous design here)
 * never opens anything on an iPhone. `showPicker()` is still called on click as a same-gesture
 * enhancement for desktop browsers, where clicking the text portion of a date field doesn't
 * always open the calendar the way clicking its icon does — but it's not load-bearing for iOS,
 * since the real tap already did the job there regardless of whether showPicker() throws.
 *
 * `interactive` defaults to true for the account-stream/multi-account-stream scrubber views;
 * `outstanding-flow-row` embeds this chip as a plain read-only date badge inside its own clickable
 * tile, so it opts out — a clickable picker nested in there would fire on top of (and be confused
 * with) the tile's click.
 *
 * `bare` strips this chip's own border/background so it can sit inside another element's chip
 * chrome (e.g. `outstanding-flow-row`'s tile, which draws its own border around the date and the
 * Flow name together) without doubling up the border.
 */
@Component({
  selector: 'app-calendar-chip',
  templateUrl: './calendar-chip.html',
  styleUrl: './calendar-chip.css',
})
export class CalendarChip {
  readonly date = input.required<Date>();
  readonly interactive = input(true);
  readonly bare = input(false);
  readonly dateSelected = output<Date>();

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

  protected openPicker(input: HTMLInputElement): void {
    try {
      input.showPicker();
    } catch {
      input.focus();
    }
  }

  protected onInputChange(input: HTMLInputElement): void {
    // Clearing the native input (its own "X"/clear control) fires change with an empty string,
    // which parseDateInput can't turn into a real Date — keep the current date instead of
    // propagating NaN. Angular's [value] binding won't re-touch the DOM if the bound date hasn't
    // changed, so reset it directly or the input stays visually blank despite nothing changing.
    if (!input.value) {
      input.value = dateInputValue(this.date());
      return;
    }
    this.dateSelected.emit(parseDateInput(input.value));
  }
}
