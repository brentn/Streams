import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BudgetFlow, Flow, RecurringFlow } from '../../../core/models/flow';
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

  function createComponent(flows: Flow[] = [], accountId = 'acc-1') {
    const fixture = TestBed.createComponent(FlowList);
    fixture.componentRef.setInput('accountId', accountId);
    fixture.componentRef.setInput('flows', flows);
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
});
