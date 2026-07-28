import { Dialog } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Flow, RecurringFlow } from '../../../core/models/flow';
import { Transaction } from '../../../core/models/transaction';
import { StorageRepository } from '../../../core/storage/storage-repository';
import { AssignFlowDialog, AssignFlowDialogResult } from './assign-flow-dialog/assign-flow-dialog';
import { TransactionReview } from './transaction-review';

const coffeeFlow: RecurringFlow = {
  id: 'flow-coffee',
  accountId: 'acc-1',
  name: 'Coffee',
  direction: 'out',
  kind: 'recurring',
  amount: 5,
  cadence: { period: 'week', interval: 1, anchors: [{ dayOfWeek: 1 }], anchorDate: new Date('2026-01-05') },
};

const payrollFlow: RecurringFlow = {
  id: 'flow-payroll',
  accountId: 'acc-1',
  name: 'Paycheck',
  direction: 'in',
  kind: 'recurring',
  amount: 2000,
  cadence: { period: 'month', interval: 1, anchors: [{ day: 1 }], anchorDate: new Date('2026-01-01') },
};

const unmatched: Transaction = {
  id: 'txn-1',
  accountId: 'acc-1',
  date: new Date('2026-07-20'),
  amount: -4.5,
  description: 'COFFEE SHOP #42',
  matchedFlowId: null,
};

const matched: Transaction = {
  id: 'txn-2',
  accountId: 'acc-1',
  date: new Date('2026-07-19'),
  amount: 2000,
  description: 'PAYROLL DEPOSIT',
  matchedFlowId: 'flow-payroll',
};

describe('TransactionReview', () => {
  let storage: {
    upsertCategorizationRule: ReturnType<typeof vi.fn>;
    upsertTransactions: ReturnType<typeof vi.fn>;
    getCategorizationRules: ReturnType<typeof vi.fn>;
    upsertFlow: ReturnType<typeof vi.fn>;
  };
  let dialog: { open: ReturnType<typeof vi.fn> };
  let dialogClosed: Subject<AssignFlowDialogResult | undefined>;

  beforeEach(async () => {
    storage = {
      upsertCategorizationRule: vi.fn(),
      upsertTransactions: vi.fn(),
      getCategorizationRules: vi.fn().mockResolvedValue([]),
      upsertFlow: vi.fn(),
    };
    dialogClosed = new Subject<AssignFlowDialogResult | undefined>();
    dialog = { open: vi.fn().mockReturnValue({ closed: dialogClosed }) };

    await TestBed.configureTestingModule({
      imports: [TransactionReview],
      providers: [
        { provide: StorageRepository, useValue: storage },
        { provide: Dialog, useValue: dialog },
      ],
    }).compileComponents();
  });

  function createComponent(transactions: Transaction[] = [], flows: Flow[] = []) {
    const fixture = TestBed.createComponent(TransactionReview);
    fixture.componentRef.setInput('transactions', transactions);
    fixture.componentRef.setInput('flows', flows);
    return fixture.componentInstance;
  }

  it('separates unmatched Transactions from matched ones, most recent first', () => {
    const component = createComponent([matched, unmatched]);

    expect(component['unmatched']()).toEqual([unmatched]);
    expect(component['matched']()).toEqual([matched]);
  });

  it('resolves a matched Transaction to its Flow name', () => {
    const component = createComponent([], [payrollFlow]);

    expect(component['flowName']('flow-payroll')).toBe('Paycheck');
  });

  it('opens the Assign Flow dialog with the Transaction and available Flows', () => {
    const component = createComponent([matched], [payrollFlow]);

    component['openAssignForm'](matched);

    expect(dialog.open).toHaveBeenCalledWith(AssignFlowDialog, {
      data: { transaction: matched, flows: [payrollFlow] },
    });
  });

  it('assigning a Flow upserts a Categorization Rule and updates the Transaction, then emits changed', async () => {
    const component = createComponent([unmatched], [coffeeFlow]);
    const changed = vi.fn();
    component.changed.subscribe(changed);
    storage.getCategorizationRules.mockResolvedValue([
      { matchText: 'coffee shop', flowId: 'flow-coffee' },
    ]);

    component['openAssignForm'](unmatched);
    dialogClosed.next({ matchText: 'coffee shop', flowId: 'flow-coffee' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(storage.upsertCategorizationRule).toHaveBeenCalledWith({
      matchText: 'coffee shop',
      flowId: 'flow-coffee',
    });
    expect(storage.upsertTransactions).toHaveBeenCalledWith([
      { ...unmatched, matchedFlowId: 'flow-coffee' },
    ]);
    expect(changed).toHaveBeenCalled();
  });

  it('persists a newly created Flow from the dialog before the Categorization Rule', async () => {
    const brandNewFlow: RecurringFlow = {
      id: 'flow-new',
      accountId: 'acc-1',
      name: 'Coffee',
      direction: 'out',
      kind: 'recurring',
      amount: 5,
      cadence: { period: 'week', interval: 1, anchors: [{ dayOfWeek: 1 }], anchorDate: new Date('2026-01-05') },
    };
    const component = createComponent([unmatched]);
    storage.getCategorizationRules.mockResolvedValue([
      { matchText: 'coffee shop', flowId: 'flow-new' },
    ]);

    component['openAssignForm'](unmatched);
    dialogClosed.next({ matchText: 'coffee shop', flowId: 'flow-new', newFlow: brandNewFlow });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(storage.upsertFlow).toHaveBeenCalledWith(brandNewFlow);
    expect(storage.upsertCategorizationRule).toHaveBeenCalledWith({
      matchText: 'coffee shop',
      flowId: 'flow-new',
    });
  });

  it('correcting an already-matched Transaction overwrites the rule and the match in place', async () => {
    const component = createComponent([matched], [payrollFlow, coffeeFlow]);
    storage.getCategorizationRules.mockResolvedValue([
      { matchText: 'payroll deposit', flowId: 'flow-coffee' },
    ]);

    component['openAssignForm'](matched);
    dialogClosed.next({ matchText: 'payroll deposit', flowId: 'flow-coffee' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(storage.upsertCategorizationRule).toHaveBeenCalledWith({
      matchText: 'payroll deposit',
      flowId: 'flow-coffee',
    });
    expect(storage.upsertTransactions).toHaveBeenCalledWith([
      { ...matched, matchedFlowId: 'flow-coffee' },
    ]);
  });

  it('recategorizes other currently loaded Transactions that now match the corrected rule', async () => {
    const otherCoffee: Transaction = {
      id: 'txn-3',
      accountId: 'acc-1',
      date: new Date('2026-07-18'),
      amount: -6,
      description: 'COFFEE SHOP #99',
      matchedFlowId: null,
    };
    const component = createComponent([unmatched, otherCoffee], [coffeeFlow]);
    storage.getCategorizationRules.mockResolvedValue([
      { matchText: 'coffee shop', flowId: 'flow-coffee' },
    ]);

    component['openAssignForm'](unmatched);
    dialogClosed.next({ matchText: 'coffee shop', flowId: 'flow-coffee' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(storage.upsertTransactions).toHaveBeenCalledWith([
      { ...unmatched, matchedFlowId: 'flow-coffee' },
      { ...otherCoffee, matchedFlowId: 'flow-coffee' },
    ]);
  });

  it('does nothing when the dialog closes with no result (cancelled)', async () => {
    const component = createComponent([unmatched]);

    component['openAssignForm'](unmatched);
    dialogClosed.next(undefined);
    await Promise.resolve();

    expect(storage.upsertCategorizationRule).not.toHaveBeenCalled();
    expect(storage.upsertTransactions).not.toHaveBeenCalled();
  });
});
