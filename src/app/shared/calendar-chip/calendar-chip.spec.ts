import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addDays, normalizeDay, SCRUB_MAX_DAYS, SCRUB_MIN_DAYS } from '../../core/charting/date-window';
import { dateInputValue } from '../date-input';
import { CalendarChip } from './calendar-chip';

const NOW = new Date('2026-07-25T12:00:00Z');
const TODAY = normalizeDay(NOW);

describe('CalendarChip', () => {
  function createComponent(date: Date, interactive?: boolean) {
    TestBed.configureTestingModule({ imports: [CalendarChip] });
    const fixture = TestBed.createComponent(CalendarChip);
    fixture.componentRef.setInput('date', date);
    if (interactive !== undefined) fixture.componentRef.setInput('interactive', interactive);
    fixture.detectChanges();
    return { component: fixture.componentInstance, fixture };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the month, day, and year only when it differs from the current year', () => {
    const { fixture } = createComponent(new Date(2026, 6, 4));

    expect(fixture.nativeElement.querySelector('.month').textContent).toBe('JUL');
    expect(fixture.nativeElement.querySelector('.day').textContent).toBe('4');
    expect(fixture.nativeElement.querySelector('.year')).toBeNull();
  });

  it('shows the year when the date is not in the current year', () => {
    const { fixture } = createComponent(new Date(2020, 0, 1));

    expect(fixture.nativeElement.querySelector('.year').textContent).toBe('2020');
  });

  it('renders as a clickable button rather than inert markup', () => {
    const { fixture } = createComponent(new Date(2026, 6, 4));

    expect(fixture.nativeElement.querySelector('button.calendar-chip')).toBeTruthy();
  });

  it("binds the hidden date input to the current scrub position, not always to today", () => {
    const { fixture } = createComponent(addDays(TODAY, 20));

    const input = fixture.nativeElement.querySelector('input[type="date"]') as HTMLInputElement;
    expect(input.value).toBe(dateInputValue(addDays(TODAY, 20)));
  });

  it('bounds the hidden input to -365..+180 days from today, matching the scrub clamp', () => {
    const { fixture } = createComponent(TODAY);

    const input = fixture.nativeElement.querySelector('input[type="date"]') as HTMLInputElement;
    expect(input.min).toBe(dateInputValue(addDays(TODAY, SCRUB_MIN_DAYS)));
    expect(input.max).toBe(dateInputValue(addDays(TODAY, SCRUB_MAX_DAYS)));
  });

  it('opens the native picker on the hidden input when the chip is clicked', () => {
    const { fixture } = createComponent(TODAY);
    const input = fixture.nativeElement.querySelector('input[type="date"]') as HTMLInputElement;
    const showPicker = vi.fn();
    input.showPicker = showPicker;

    fixture.nativeElement.querySelector('button.calendar-chip').click();

    expect(showPicker).toHaveBeenCalled();
  });

  it('falls back to focusing the input when showPicker is unsupported', () => {
    const { fixture } = createComponent(TODAY);
    const input = fixture.nativeElement.querySelector('input[type="date"]') as HTMLInputElement;
    input.showPicker = undefined as unknown as () => void;
    const focus = vi.fn();
    input.focus = focus;

    fixture.nativeElement.querySelector('button.calendar-chip').click();

    expect(focus).toHaveBeenCalled();
  });

  it('falls back to focusing the input when showPicker throws (e.g. lacking user activation)', () => {
    const { fixture } = createComponent(TODAY);
    const input = fixture.nativeElement.querySelector('input[type="date"]') as HTMLInputElement;
    input.showPicker = vi.fn(() => {
      throw new DOMException('not allowed', 'NotAllowedError');
    });
    const focus = vi.fn();
    input.focus = focus;

    fixture.nativeElement.querySelector('button.calendar-chip').click();

    expect(focus).toHaveBeenCalled();
  });

  it('emits the picked date when the hidden input changes', () => {
    const { component, fixture } = createComponent(TODAY);
    const input = fixture.nativeElement.querySelector('input[type="date"]') as HTMLInputElement;
    const emitted: Date[] = [];
    component.dateSelected.subscribe((date) => emitted.push(date));

    input.value = dateInputValue(addDays(TODAY, 10));
    input.dispatchEvent(new Event('change'));

    expect(emitted).toEqual([addDays(TODAY, 10)]);
  });

  describe('Today button (only shown while the native picker is open)', () => {
    it('is not rendered normally', () => {
      const { fixture } = createComponent(addDays(TODAY, 20));

      expect(fixture.nativeElement.querySelector('.today')).toBeNull();
    });

    it('appears once the hidden input gains focus (the picker opening), and disappears once it blurs (the picker closing)', () => {
      const { fixture } = createComponent(TODAY);
      const input = fixture.nativeElement.querySelector('input[type="date"]') as HTMLInputElement;

      input.dispatchEvent(new Event('focus'));
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.today')).toBeTruthy();

      input.dispatchEvent(new Event('blur'));
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.today')).toBeNull();
    });

    it("emits today's date and blurs the hidden input (closing the native picker) when clicked", () => {
      const { component, fixture } = createComponent(addDays(TODAY, 20));
      const input = fixture.nativeElement.querySelector('input[type="date"]') as HTMLInputElement;
      const blur = vi.fn();
      input.blur = blur;
      const emitted: Date[] = [];
      component.dateSelected.subscribe((date) => emitted.push(date));

      input.dispatchEvent(new Event('focus'));
      fixture.detectChanges();
      const todayButton = fixture.nativeElement.querySelector('.today') as HTMLButtonElement;
      todayButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

      expect(emitted).toEqual([TODAY]);
      expect(blur).toHaveBeenCalled();
    });
  });

  describe('interactive: false (a read-only date badge, e.g. an Outstanding tile)', () => {
    it('renders no button, no hidden input, and no Today button', () => {
      const { fixture } = createComponent(new Date(2026, 6, 4), false);

      expect(fixture.nativeElement.querySelector('button.calendar-chip')).toBeNull();
      expect(fixture.nativeElement.querySelector('input[type="date"]')).toBeNull();
      expect(fixture.nativeElement.querySelector('.today')).toBeNull();
    });

    it('still renders the month/day/year, as a plain div', () => {
      const { fixture } = createComponent(new Date(2020, 0, 1), false);

      expect(fixture.nativeElement.querySelector('div.calendar-chip')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('.month').textContent).toBe('JAN');
      expect(fixture.nativeElement.querySelector('.day').textContent).toBe('1');
      expect(fixture.nativeElement.querySelector('.year').textContent).toBe('2020');
    });
  });

  it('recomputes min/max from the current date on each call, rather than freezing it at construction', () => {
    const { component } = createComponent(TODAY);

    expect(component['minValue']()).toBe(dateInputValue(addDays(TODAY, SCRUB_MIN_DAYS)));

    vi.setSystemTime(addDays(NOW, 1));

    expect(component['minValue']()).toBe(dateInputValue(addDays(TODAY, SCRUB_MIN_DAYS + 1)));
    expect(component['maxValue']()).toBe(dateInputValue(addDays(TODAY, SCRUB_MAX_DAYS + 1)));
  });
});
