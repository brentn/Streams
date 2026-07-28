import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { BudgetFlow, RecurringFlow } from '../../../core/models/flow';
import { FlowForm } from './flow-form';

describe('FlowForm', () => {
  async function createComponent(accountId = 'acc-1', flow: RecurringFlow | BudgetFlow | null = null) {
    await TestBed.configureTestingModule({ imports: [FlowForm] }).compileComponents();
    const fixture = TestBed.createComponent(FlowForm);
    fixture.componentRef.setInput('accountId', accountId);
    fixture.componentRef.setInput('flow', flow);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('emits a new recurring Flow on save', async () => {
    const component = await createComponent();
    const saved = vi.fn();
    component.saved.subscribe(saved);

    component['name'].set('Paycheck');
    component['direction'].set('in');
    component['kind'].set('recurring');
    component['amount'].set(2000);
    component['cadenceOption'].set('monthly');
    component['cadenceFields'].set({ ...component['cadenceFields'](), day: 1 });

    component['save']();

    expect(saved).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'acc-1',
        name: 'Paycheck',
        direction: 'in',
        kind: 'recurring',
        amount: 2000,
        cadence: expect.objectContaining({
          period: 'month',
          interval: 1,
          anchors: [{ day: 1 }],
        }),
      }),
    );
  });

  it('emits a new budget Flow on save', async () => {
    const component = await createComponent();
    const saved = vi.fn();
    component.saved.subscribe(saved);

    component['name'].set('Groceries');
    component['direction'].set('out');
    component['kind'].set('budget');
    component['amount'].set(400);
    component['budgetPeriod'].set('month');

    component['save']();

    expect(saved).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'acc-1',
        name: 'Groceries',
        direction: 'out',
        kind: 'budget',
        limit: 400,
        period: 'month',
      }),
    );
  });

  it('pre-fills the form from an existing recurring Flow', async () => {
    const flow: RecurringFlow = {
      id: 'flow-1',
      accountId: 'acc-1',
      name: 'Paycheck',
      direction: 'in',
      kind: 'recurring',
      amount: 2000,
      cadence: {
        period: 'week',
        interval: 2,
        anchors: [{ dayOfWeek: 5 }],
        anchorDate: new Date(2026, 0, 2),
      },
    };

    const component = await createComponent('acc-1', flow);

    expect(component['name']()).toBe('Paycheck');
    expect(component['amount']()).toBe(2000);
    expect(component['cadenceOption']()).toBe('biweekly');
    expect(component['cadenceFields']().dayOfWeek).toBe(5);
  });

  it('saves an edit with the same id, keeping kind fixed', async () => {
    const flow: BudgetFlow = {
      id: 'flow-1',
      accountId: 'acc-1',
      name: 'Groceries',
      direction: 'out',
      kind: 'budget',
      limit: 400,
      period: 'month',
    };

    const component = await createComponent('acc-1', flow);
    const saved = vi.fn();
    component.saved.subscribe(saved);
    component['amount'].set(500);

    component['save']();

    expect(saved).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'flow-1', kind: 'budget', limit: 500 }),
    );
  });

  it('includes amountChanges on save, for a recurring Flow', async () => {
    const component = await createComponent();
    const saved = vi.fn();
    component.saved.subscribe(saved);

    component['name'].set('Paycheck');
    component['kind'].set('recurring');
    component['amount'].set(2000);
    component['amountChanges'].set([
      { type: 'step', effectiveDate: new Date(2027, 0, 1), amount: 2200 },
    ]);

    component['save']();

    expect(saved).toHaveBeenCalledWith(
      expect.objectContaining({
        amountChanges: [{ type: 'step', effectiveDate: new Date(2027, 0, 1), amount: 2200 }],
      }),
    );
  });

  it('includes amountChanges on save, for a budget Flow', async () => {
    const component = await createComponent();
    const saved = vi.fn();
    component.saved.subscribe(saved);

    component['name'].set('Groceries');
    component['kind'].set('budget');
    component['amount'].set(400);
    component['amountChanges'].set([
      { type: 'recurring-rule', anniversaryDate: new Date(2027, 0, 1), delta: 25 },
    ]);

    component['save']();

    expect(saved).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'budget',
        amountChanges: [{ type: 'recurring-rule', anniversaryDate: new Date(2027, 0, 1), delta: 25 }],
      }),
    );
  });

  it('pre-fills amountChanges from an existing Flow', async () => {
    const flow: RecurringFlow = {
      id: 'flow-1',
      accountId: 'acc-1',
      name: 'Paycheck',
      direction: 'in',
      kind: 'recurring',
      amount: 2000,
      cadence: {
        period: 'month',
        interval: 1,
        anchors: [{ day: 1 }],
        anchorDate: new Date(2026, 0, 1),
      },
      amountChanges: [{ type: 'step', effectiveDate: new Date(2027, 0, 1), amount: 2200 }],
    };

    const component = await createComponent('acc-1', flow);

    expect(component['amountChanges']()).toEqual([
      { type: 'step', effectiveDate: new Date(2027, 0, 1), amount: 2200 },
    ]);
  });

  it('emits cancelled without emitting saved', async () => {
    const component = await createComponent();
    const saved = vi.fn();
    const cancelled = vi.fn();
    component.saved.subscribe(saved);
    component.cancelled.subscribe(cancelled);

    component['cancel']();

    expect(cancelled).toHaveBeenCalled();
    expect(saved).not.toHaveBeenCalled();
  });
});
