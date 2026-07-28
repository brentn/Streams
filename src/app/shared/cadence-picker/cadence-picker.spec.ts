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
    return fixture.componentInstance;
  }

  it('emits the new option on change', async () => {
    const component = await createComponent();
    const changed = vi.fn();
    component.optionChanged.subscribe(changed);

    component['onOptionChange']('weekly');

    expect(changed).toHaveBeenCalledWith('weekly');
  });

  it('emits an updated fields object, merging in just the changed key', async () => {
    const fields = defaultCadenceFields();
    const component = await createComponent('monthly', fields);
    const changed = vi.fn();
    component.fieldsChanged.subscribe(changed);

    component['updateField']('day', 15);

    expect(changed).toHaveBeenCalledWith({ ...fields, day: 15 });
  });

  it('emits an updated anchorDate parsed from a date input value', async () => {
    const component = await createComponent('biweekly');
    const changed = vi.fn();
    component.fieldsChanged.subscribe(changed);

    component['onAnchorDateInput']('2026-03-15');

    expect(changed).toHaveBeenCalledWith(
      expect.objectContaining({ anchorDate: new Date(2026, 2, 15) }),
    );
  });
});
