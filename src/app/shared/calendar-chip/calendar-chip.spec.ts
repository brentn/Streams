import { Dialog } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { CalendarChip } from './calendar-chip';
import { DatePickerDialog } from '../date-picker-dialog/date-picker-dialog';

describe('CalendarChip', () => {
  let dialog: { open: ReturnType<typeof vi.fn> };

  function createComponent(date: Date) {
    dialog = { open: vi.fn() };
    TestBed.configureTestingModule({
      imports: [CalendarChip],
      providers: [{ provide: Dialog, useValue: dialog }],
    });
    const fixture = TestBed.createComponent(CalendarChip);
    fixture.componentRef.setInput('date', date);
    fixture.detectChanges();
    return { component: fixture.componentInstance, fixture };
  }

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

  it('opens the DatePickerDialog on click', () => {
    const { fixture } = createComponent(new Date(2026, 6, 4));
    dialog.open.mockReturnValue({ closed: new Subject() });

    fixture.nativeElement.querySelector('button').click();

    expect(dialog.open).toHaveBeenCalledWith(DatePickerDialog);
  });

  it('emits the chosen date when the dialog closes with a result', () => {
    const { component, fixture } = createComponent(new Date(2026, 6, 4));
    const closed = new Subject<Date | undefined>();
    dialog.open.mockReturnValue({ closed });
    const emitted: Date[] = [];
    component.dateSelected.subscribe((date) => emitted.push(date));

    fixture.nativeElement.querySelector('button').click();
    closed.next(new Date(2026, 7, 10));

    expect(emitted).toEqual([new Date(2026, 7, 10)]);
  });

  it('emits nothing when the dialog is cancelled', () => {
    const { component, fixture } = createComponent(new Date(2026, 6, 4));
    const closed = new Subject<Date | undefined>();
    dialog.open.mockReturnValue({ closed });
    const emitted: Date[] = [];
    component.dateSelected.subscribe((date) => emitted.push(date));

    fixture.nativeElement.querySelector('button').click();
    closed.next(undefined);

    expect(emitted).toEqual([]);
  });
});
