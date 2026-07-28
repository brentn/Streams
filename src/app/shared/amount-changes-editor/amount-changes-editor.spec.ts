import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { AmountChange } from '../../core/models/flow';
import { AmountChangesEditor } from './amount-changes-editor';

describe('AmountChangesEditor', () => {
  async function createComponent(changes: AmountChange[] = []) {
    await TestBed.configureTestingModule({ imports: [AmountChangesEditor] }).compileComponents();
    const fixture = TestBed.createComponent(AmountChangesEditor);
    fixture.componentRef.setInput('changes', changes);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('emits changes with a new Step Change appended', async () => {
    const component = await createComponent();
    const updated = vi.fn();
    component.changesUpdated.subscribe(updated);

    component['newStepDate'].set(new Date(2027, 0, 1));
    component['newStepAmount'].set(2200);
    component['addStepChange']();

    expect(updated).toHaveBeenCalledWith([
      { type: 'step', effectiveDate: new Date(2027, 0, 1), amount: 2200 },
    ]);
  });

  it('emits changes with a new Recurring Rule appended', async () => {
    const component = await createComponent();
    const updated = vi.fn();
    component.changesUpdated.subscribe(updated);

    component['newRuleDate'].set(new Date(2027, 0, 1));
    component['newRuleDelta'].set(25);
    component['addRecurringRule']();

    expect(updated).toHaveBeenCalledWith([
      { type: 'recurring-rule', anniversaryDate: new Date(2027, 0, 1), delta: 25 },
    ]);
  });

  it('emits changes with the entry at the given index removed', async () => {
    const changes: AmountChange[] = [
      { type: 'step', effectiveDate: new Date(2027, 0, 1), amount: 2200 },
      { type: 'step', effectiveDate: new Date(2028, 0, 1), amount: 2400 },
    ];
    const component = await createComponent(changes);
    const updated = vi.fn();
    component.changesUpdated.subscribe(updated);

    component['removeAmountChange'](0);

    expect(updated).toHaveBeenCalledWith([changes[1]]);
  });

  it('describes a Step Change and a Recurring Rule', async () => {
    const component = await createComponent();

    expect(
      component['describeAmountChange']({
        type: 'step',
        effectiveDate: new Date(2027, 0, 1),
        amount: 2200,
      }),
    ).toContain('Step Change to 2200');

    expect(
      component['describeAmountChange']({
        type: 'recurring-rule',
        anniversaryDate: new Date(2027, 0, 1),
        delta: 25,
      }),
    ).toContain('Recurring Rule: +25');
  });
});
