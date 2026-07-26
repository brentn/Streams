import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BudgetFlow, RecurringFlow } from '../../../core/models/flow';
import { StorageRepository } from '../../../core/storage/storage-repository';
import { FlowList } from './flow-list';

describe('FlowList', () => {
  let storage: {
    getFlowsForAccount: ReturnType<typeof vi.fn>;
    upsertFlow: ReturnType<typeof vi.fn>;
    deleteFlow: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    storage = {
      getFlowsForAccount: vi.fn().mockResolvedValue([]),
      upsertFlow: vi.fn(),
      deleteFlow: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [FlowList],
      providers: [{ provide: StorageRepository, useValue: storage }],
    }).compileComponents();
  });

  function createComponent(accountId = 'acc-1') {
    const fixture = TestBed.createComponent(FlowList);
    fixture.componentRef.setInput('accountId', accountId);
    return fixture.componentInstance;
  }

  it('loads Flows for the given account', async () => {
    const flow: BudgetFlow = {
      id: 'flow-1',
      accountId: 'acc-1',
      name: 'Groceries',
      direction: 'out',
      kind: 'budget',
      limit: 400,
      period: 'month',
    };
    storage.getFlowsForAccount.mockResolvedValue([flow]);

    const component = createComponent();
    await component['load']('acc-1');

    expect(component['flows']()).toEqual([flow]);
  });

  it('creates a new recurring Flow and emits changed', async () => {
    const component = createComponent();
    const changed = vi.fn();
    component.changed.subscribe(changed);

    component['openCreateForm']();
    component['name'].set('Paycheck');
    component['direction'].set('in');
    component['kind'].set('recurring');
    component['amount'].set(2000);
    component['cadenceOption'].set('monthly');
    component['updateCadenceField']('day', 1);

    await component['save']();

    expect(storage.upsertFlow).toHaveBeenCalledWith(
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
    expect(component['isFormOpen']()).toBe(false);
    expect(changed).toHaveBeenCalled();
  });

  it('creates a new budget Flow', async () => {
    const component = createComponent();

    component['openCreateForm']();
    component['name'].set('Groceries');
    component['direction'].set('out');
    component['kind'].set('budget');
    component['amount'].set(400);
    component['budgetPeriod'].set('month');

    await component['save']();

    expect(storage.upsertFlow).toHaveBeenCalledWith(
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

  it('pre-fills the form from an existing recurring Flow when editing', () => {
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

    const component = createComponent();
    component['openEditForm'](flow);

    expect(component['editingFlowId']()).toBe('flow-1');
    expect(component['name']()).toBe('Paycheck');
    expect(component['amount']()).toBe(2000);
    expect(component['cadenceOption']()).toBe('biweekly');
    expect(component['cadenceFields']().dayOfWeek).toBe(5);
  });

  it('saves an edited Flow with the same id, keeping its kind fixed', async () => {
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
    component['amount'].set(500);

    await component['save']();

    expect(storage.upsertFlow).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'flow-1', kind: 'budget', limit: 500 }),
    );
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
});
