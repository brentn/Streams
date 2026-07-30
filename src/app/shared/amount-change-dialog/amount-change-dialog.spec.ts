import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { AmountChange } from '../../core/models/flow';
import { AmountChangeDialog, AmountChangeDialogData } from './amount-change-dialog';

describe('AmountChangeDialog', () => {
  let dialogRef: { close: ReturnType<typeof vi.fn> };

  function createComponent(data: AmountChangeDialogData) {
    dialogRef = { close: vi.fn() };
    TestBed.configureTestingModule({
      imports: [AmountChangeDialog],
      providers: [
        { provide: DialogRef, useValue: dialogRef },
        { provide: DIALOG_DATA, useValue: data },
      ],
    });
    const fixture = TestBed.createComponent(AmountChangeDialog);
    fixture.detectChanges();
    return { component: fixture.componentInstance, fixture };
  }

  const existingStep: AmountChange = {
    type: 'step',
    effectiveDate: new Date(2027, 0, 1),
    amount: 2200,
  };
  const existingRule: AmountChange = {
    type: 'recurring-rule',
    anniversaryDate: new Date(2027, 6, 1),
    delta: 100,
  };

  it('shows only the Step Changes belonging to this mode, in step mode', async () => {
    const { component } = createComponent({ mode: 'step', changes: [existingStep, existingRule] });

    expect(component['changes']()).toEqual([existingStep]);
  });

  it('shows only the Recurring Rules belonging to this mode, in recurring mode', async () => {
    const { component } = createComponent({ mode: 'recurring-rule', changes: [existingStep, existingRule] });

    expect(component['changes']()).toEqual([existingRule]);
  });

  it('adds a new Step Change in step mode', async () => {
    const { component } = createComponent({ mode: 'step', changes: [] });

    component['onDateInput']('2027-03-15');
    component['newValue'].set(2400);
    component['add']();

    expect(component['changes']()).toEqual([
      { type: 'step', effectiveDate: new Date(2027, 2, 15), amount: 2400 },
    ]);
  });

  it('adds a new Recurring Rule in recurring mode', async () => {
    const { component } = createComponent({ mode: 'recurring-rule', changes: [] });

    component['onDateInput']('2027-10-01');
    component['newValue'].set(50);
    component['add']();

    expect(component['changes']()).toEqual([
      { type: 'recurring-rule', anniversaryDate: new Date(2027, 9, 1), delta: 50 },
    ]);
  });

  it('removes a change at the given index', async () => {
    const { component } = createComponent({ mode: 'step', changes: [existingStep] });

    component['remove'](0);

    expect(component['changes']()).toEqual([]);
  });

  it('closes with this-mode changes merged back alongside the other mode, untouched, on save', async () => {
    const { component } = createComponent({ mode: 'step', changes: [existingStep, existingRule] });

    component['remove'](0);
    component['onDateInput']('2027-05-05');
    component['newValue'].set(3000);
    component['add']();
    component['save']();

    expect(dialogRef.close).toHaveBeenCalledWith([
      existingRule,
      { type: 'step', effectiveDate: new Date(2027, 4, 5), amount: 3000 },
    ]);
  });

  it('closes with no result on cancel', async () => {
    const { component } = createComponent({ mode: 'step', changes: [existingStep] });

    component['cancel']();

    expect(dialogRef.close).toHaveBeenCalledWith();
  });

  it('defaults amountLabel to "amount" when the caller does not specify one', async () => {
    const { component } = createComponent({ mode: 'step', changes: [] });

    expect(component['amountLabel']).toBe('amount');
  });

  it('uses the caller-provided amountLabel, for a Budget Flow\'s limit', async () => {
    const { component } = createComponent({ mode: 'step', changes: [], amountLabel: 'limit' });

    expect(component['amountLabel']).toBe('limit');
  });
});
