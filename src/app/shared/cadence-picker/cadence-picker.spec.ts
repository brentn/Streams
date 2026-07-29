import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { defaultCadenceFields } from '../../core/projection/cadence-options';
import { CadencePicker } from './cadence-picker';

describe('CadencePicker', () => {
  async function createComponent(option = 'monthly', fields = defaultCadenceFields()) {
    await TestBed.configureTestingModule({ imports: [CadencePicker] }).compileComponents();
    const fixture = TestBed.createComponent(CadencePicker);
    fixture.componentRef.setInput('option', option);
    fixture.componentRef.setInput('fields', fields);
    fixture.detectChanges();
    return { component: fixture.componentInstance, fixture };
  }

  it('emits the new option on change', async () => {
    const { component } = await createComponent();
    const changed = vi.fn();
    component.optionChanged.subscribe(changed);

    component['onOptionChange']('weekly');

    expect(changed).toHaveBeenCalledWith('weekly');
  });

  it('emits an updated fields object, merging in just the changed key', async () => {
    const fields = defaultCadenceFields();
    const { component } = await createComponent('monthly', fields);
    const changed = vi.fn();
    component.fieldsChanged.subscribe(changed);

    component['updateField']('day', 15);

    expect(changed).toHaveBeenCalledWith({ ...fields, day: 15 });
  });

  it('emits an updated anchorDate parsed from a date input value', async () => {
    const { component } = await createComponent('biweekly');
    const changed = vi.fn();
    component.fieldsChanged.subscribe(changed);

    component['onAnchorDateInput']('2026-03-15');

    expect(changed).toHaveBeenCalledWith(
      expect.objectContaining({ anchorDate: new Date(2026, 2, 15) }),
    );
  });

  it('emits an updated date parsed from a date input value for the one-time option', async () => {
    const { component } = await createComponent('once');
    const changed = vi.fn();
    component.fieldsChanged.subscribe(changed);

    component['onDateInput']('2026-03-15');

    expect(changed).toHaveBeenCalledWith(expect.objectContaining({ date: new Date(2026, 2, 15) }));
  });

  it('emits an updated endDate parsed from a date input value', async () => {
    const { component } = await createComponent('monthly');
    const changed = vi.fn();
    component.fieldsChanged.subscribe(changed);

    component['onEndDateInput']('2026-12-31');

    expect(changed).toHaveBeenCalledWith(expect.objectContaining({ endDate: new Date(2026, 11, 31) }));
  });

  it('clears endDate when the End Date input is emptied', async () => {
    const fields = { ...defaultCadenceFields(), endDate: new Date(2026, 11, 31) };
    const { component } = await createComponent('monthly', fields);
    const changed = vi.fn();
    component.fieldsChanged.subscribe(changed);

    component['onEndDateInput']('');

    expect(changed).toHaveBeenCalledWith(expect.objectContaining({ endDate: undefined }));
  });

  it('keeps the last day when the day input is cleared, instead of going NaN', async () => {
    const fields = { ...defaultCadenceFields(), day: 15 };
    const { component, fixture } = await createComponent('monthly', fields);
    const changed = vi.fn();
    component.fieldsChanged.subscribe(changed);

    const input: HTMLInputElement = fixture.nativeElement.querySelector('input[type="number"]');
    input.value = '';
    input.dispatchEvent(new Event('input'));

    expect(changed).toHaveBeenCalledWith(expect.objectContaining({ day: 15 }));
  });

  it('surfaces no End Date error when fields are valid', async () => {
    const fields = { ...defaultCadenceFields(), anchorDate: new Date(2026, 0, 1), endDate: new Date(2026, 5, 1) };
    const { component } = await createComponent('monthly', fields);

    expect(component['endDateError']()).toBeNull();
  });

  it('surfaces an End Date error when End Date falls before the anchor date', async () => {
    const fields = { ...defaultCadenceFields(), anchorDate: new Date(2026, 5, 1), endDate: new Date(2026, 0, 1) };
    const { component } = await createComponent('monthly', fields);

    expect(component['endDateError']()).toEqual(expect.any(String));
  });
});
