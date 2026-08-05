import { DialogRef } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addDays, normalizeDay, SCRUB_MAX_DAYS, SCRUB_MIN_DAYS } from '../../core/charting/date-window';
import { dateInputValue } from '../date-input';
import { DatePickerDialog } from './date-picker-dialog';

const NOW = new Date('2026-07-25T12:00:00Z');
const TODAY = normalizeDay(NOW);

describe('DatePickerDialog', () => {
  let dialogRef: { close: ReturnType<typeof vi.fn> };

  function createComponent() {
    dialogRef = { close: vi.fn() };
    TestBed.configureTestingModule({
      imports: [DatePickerDialog],
      providers: [{ provide: DialogRef, useValue: dialogRef }],
    });
    const fixture = TestBed.createComponent(DatePickerDialog);
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

  it('defaults the pending date to today, regardless of any caller state', () => {
    const { component } = createComponent();

    expect(dateInputValue(component['pendingDate']())).toBe(dateInputValue(TODAY));
  });

  it('bounds the input to -365..+180 days from today, matching the scrub clamp', () => {
    const { component } = createComponent();

    expect(component['minValue']).toBe(dateInputValue(addDays(TODAY, SCRUB_MIN_DAYS)));
    expect(component['maxValue']).toBe(dateInputValue(addDays(TODAY, SCRUB_MAX_DAYS)));
  });

  it('updates the pending date as the input changes', () => {
    const { component } = createComponent();
    const picked = addDays(TODAY, 16);

    component['onDateInput'](dateInputValue(picked));

    expect(component['pendingDate']()).toEqual(picked);
  });

  it('closes with the pending date on Go', () => {
    const { component } = createComponent();
    const picked = addDays(TODAY, 16);

    component['onDateInput'](dateInputValue(picked));
    component['go']();

    expect(dialogRef.close).toHaveBeenCalledWith(picked);
  });

  it("closes with today's date immediately when Today is clicked, even if the input was changed first", () => {
    const { component } = createComponent();

    component['onDateInput'](dateInputValue(addDays(TODAY, 16)));
    component['useToday']();

    expect(dialogRef.close).toHaveBeenCalledWith(TODAY);
  });

  it('closes with no result on Cancel', () => {
    const { component } = createComponent();

    component['cancel']();

    expect(dialogRef.close).toHaveBeenCalledWith();
  });
});
