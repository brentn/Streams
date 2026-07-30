import { Dialog } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { Subject } from 'rxjs';
import { AmountChange } from '../../core/models/flow';
import { AmountChangeDialog } from '../amount-change-dialog/amount-change-dialog';
import { AmountRuleBadges } from './amount-rule-badges';

describe('AmountRuleBadges', () => {
  let dialog: { open: ReturnType<typeof vi.fn> };

  async function createComponent(changes: AmountChange[] = [], amountLabel?: string) {
    dialog = { open: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [AmountRuleBadges],
      providers: [{ provide: Dialog, useValue: dialog }],
    }).compileComponents();
    const fixture = TestBed.createComponent(AmountRuleBadges);
    fixture.componentRef.setInput('changes', changes);
    if (amountLabel !== undefined) fixture.componentRef.setInput('amountLabel', amountLabel);
    fixture.detectChanges();
    return { component: fixture.componentInstance, fixture };
  }

  const step: AmountChange = { type: 'step', effectiveDate: new Date(2027, 0, 1), amount: 2200 };
  const rule: AmountChange = { type: 'recurring-rule', anniversaryDate: new Date(2027, 0, 1), delta: 25 };

  it('counts Step Changes and Recurring Rules separately', async () => {
    const { component } = await createComponent([step, rule, rule]);

    expect(component['stepChangeCount']()).toBe(1);
    expect(component['recurringRuleCount']()).toBe(2);
  });

  it('opens the Step Change dialog in step mode with the current changes', async () => {
    const { component } = await createComponent([step, rule]);
    dialog.open.mockReturnValue({ closed: new Subject() });

    component['openAmountChangeDialog']('step');

    expect(dialog.open).toHaveBeenCalledWith(AmountChangeDialog, {
      data: { mode: 'step', changes: [step, rule], amountLabel: 'amount' },
    });
  });

  it('opens the Recurring Rule dialog in recurring-rule mode', async () => {
    const { component } = await createComponent([step, rule]);
    dialog.open.mockReturnValue({ closed: new Subject() });

    component['openAmountChangeDialog']('recurring-rule');

    expect(dialog.open).toHaveBeenCalledWith(AmountChangeDialog, {
      data: { mode: 'recurring-rule', changes: [step, rule], amountLabel: 'amount' },
    });
  });

  it('passes through a caller-provided amountLabel, for a Budget Flow\'s limit', async () => {
    const { component } = await createComponent([step], 'limit');
    dialog.open.mockReturnValue({ closed: new Subject() });

    component['openAmountChangeDialog']('step');

    expect(dialog.open).toHaveBeenCalledWith(AmountChangeDialog, {
      data: { mode: 'step', changes: [step], amountLabel: 'limit' },
    });
  });

  it('emits changesUpdated with the dialog result when it closes with one', async () => {
    const { component } = await createComponent([step]);
    const closed = new Subject<AmountChange[]>();
    dialog.open.mockReturnValue({ closed });
    const updated = vi.fn();
    component.changesUpdated.subscribe(updated);

    component['openAmountChangeDialog']('recurring-rule');
    closed.next([step, rule]);

    expect(updated).toHaveBeenCalledWith([step, rule]);
  });

  it('does not emit changesUpdated when the dialog closes with no result (cancel)', async () => {
    const { component } = await createComponent([step]);
    const closed = new Subject<AmountChange[] | undefined>();
    dialog.open.mockReturnValue({ closed });
    const updated = vi.fn();
    component.changesUpdated.subscribe(updated);

    component['openAmountChangeDialog']('step');
    closed.next(undefined);

    expect(updated).not.toHaveBeenCalled();
  });
});
