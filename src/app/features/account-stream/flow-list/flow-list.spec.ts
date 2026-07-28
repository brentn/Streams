import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BudgetFlow, Flow, RecurringFlow } from '../../../core/models/flow';
import { Transaction } from '../../../core/models/transaction';
import { StorageRepository } from '../../../core/storage/storage-repository';
import { FlowList } from './flow-list';

describe('FlowList', () => {
  let storage: {
    upsertFlow: ReturnType<typeof vi.fn>;
    deleteFlow: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    storage = {
      upsertFlow: vi.fn(),
      deleteFlow: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [FlowList],
      providers: [{ provide: StorageRepository, useValue: storage }],
    }).compileComponents();
  });

  function createComponent(
    flows: Flow[] = [],
    accountId = 'acc-1',
    transactions: Transaction[] = [],
  ) {
    const fixture = TestBed.createComponent(FlowList);
    fixture.componentRef.setInput('accountId', accountId);
    fixture.componentRef.setInput('flows', flows);
    fixture.componentRef.setInput('transactions', transactions);
    return fixture.componentInstance;
  }

  it('renders the Flows given via input', () => {
    const flow: BudgetFlow = {
      id: 'flow-1',
      accountId: 'acc-1',
      name: 'Groceries',
      direction: 'out',
      kind: 'budget',
      limit: 400,
      period: 'month',
    };

    const component = createComponent([flow]);

    expect(component['flows']()).toEqual([flow]);
  });

  it('opens the form in create mode with no Flow to edit', () => {
    const component = createComponent();

    component['openCreateForm']();

    expect(component['isFormOpen']()).toBe(true);
    expect(component['editingFlow']()).toBeNull();
  });

  it('opens the form in edit mode with the given Flow', () => {
    const flow: BudgetFlow = {
      id: 'flow-1',
      accountId: 'acc-1',
      name: 'Groceries',
      direction: 'out',
      kind: 'budget',
      limit: 400,
      period: 'month',
    };
    const component = createComponent();

    component['openEditForm'](flow);

    expect(component['isFormOpen']()).toBe(true);
    expect(component['editingFlow']()).toEqual(flow);
  });

  it('closes the form on cancel', () => {
    const component = createComponent();
    component['openCreateForm']();

    component['cancelForm']();

    expect(component['isFormOpen']()).toBe(false);
  });

  it('persists a Flow emitted by the form, closes the form, and emits changed', async () => {
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
    };
    const component = createComponent();
    component['openCreateForm']();
    const changed = vi.fn();
    component.changed.subscribe(changed);

    await component['onFlowSaved'](flow);

    expect(storage.upsertFlow).toHaveBeenCalledWith(flow);
    expect(component['isFormOpen']()).toBe(false);
    expect(changed).toHaveBeenCalled();
  });

  it('deletes a Flow and emits changed', async () => {
    const flow: BudgetFlow = {
      id: 'flow-1',
      accountId: 'acc-1',
      name: 'Groceries',
      direction: 'out',
      kind: 'budget',
      limit: 400,
      period: 'month',
    };
    const component = createComponent();
    const changed = vi.fn();
    component.changed.subscribe(changed);

    await component['remove'](flow);

    expect(storage.deleteFlow).toHaveBeenCalledWith('flow-1');
    expect(changed).toHaveBeenCalled();
  });

  describe('varianceAlertFor', () => {
    const flow: RecurringFlow = {
      id: 'flow-1',
      accountId: 'acc-1',
      name: 'Paycheck',
      direction: 'in',
      kind: 'recurring',
      amount: 100,
      cadence: {
        period: 'week',
        interval: 1,
        anchors: [{ dayOfWeek: 5 }], // Friday
        anchorDate: new Date(2026, 0, 2),
      },
      tolerance: { kind: 'fixed', value: 10 },
    };

    it('returns null when the Flow has no Tolerance set', () => {
      const component = createComponent([{ ...flow, tolerance: undefined }]);
      expect(component['varianceAlertFor']({ ...flow, tolerance: undefined })).toBeNull();
    });

    it('returns a Variance Alert once the actual total for the last completed period breaches Tolerance', () => {
      // Fridays in range: 07-03, 07-10, 07-17 — "now" pins the last completed period to (07-03, 07-10].
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-15T12:00:00Z'));

      const transactions: Transaction[] = [
        {
          id: 't1',
          accountId: 'acc-1',
          date: new Date('2026-07-08T09:00:00Z'), // inside the (07-03, 07-10] period
          amount: 150,
          description: 'txn',
          matchedFlowId: 'flow-1',
        },
      ];
      const component = createComponent([flow], 'acc-1', transactions);

      const alert = component['varianceAlertFor'](flow);

      expect(alert).toEqual({
        flowId: 'flow-1',
        periodStart: new Date(2026, 6, 3),
        periodEnd: new Date(2026, 6, 10),
        expected: 100,
        actual: 150,
      });
    });

    afterEach(() => {
      vi.useRealTimers();
    });
  });
});
