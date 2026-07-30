import { Dialog } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Account } from '../../../core/models/account';
import { Flow, RecurringFlow } from '../../../core/models/flow';
import { Transaction } from '../../../core/models/transaction';
import { Transfer } from '../../../core/models/transfer';
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
  matchedTarget: null,
};

const matched: Transaction = {
  id: 'txn-2',
  accountId: 'acc-1',
  date: new Date('2026-07-19'),
  amount: 2000,
  description: 'PAYROLL DEPOSIT',
  matchedTarget: { kind: 'flow', id: 'flow-payroll' },
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

  function createComponent(
    transactions: Transaction[] = [],
    flows: Flow[] = [],
    transfers: Transfer[] = [],
    accounts: Account[] = [],
  ) {
    const fixture = TestBed.createComponent(TransactionReview);
    fixture.componentRef.setInput('transactions', transactions);
    fixture.componentRef.setInput('flows', flows);
    fixture.componentRef.setInput('transfers', transfers);
    fixture.componentRef.setInput('accounts', accounts);
    return fixture.componentInstance;
  }

  it('surfaces only unmatched Transactions, most recent first', () => {
    const component = createComponent([matched, unmatched]);

    expect(component['unmatched']()).toEqual([unmatched]);
  });

  it('opens the Assign Flow dialog with the Transaction, Flows, Transfers, and Accounts', () => {
    const accounts: Account[] = [
      { id: 'acc-1', name: 'Checking', institutionName: 'Bank', balance: 0, balanceDate: new Date(), expectedSign: 1, dryFloor: 0 },
    ];
    const component = createComponent([unmatched], [payrollFlow], [], accounts);

    component['openAssignForm'](unmatched);

    expect(dialog.open).toHaveBeenCalledWith(AssignFlowDialog, {
      data: { transaction: unmatched, flows: [payrollFlow], transfers: [], accounts },
    });
  });

  it('assigning a Flow upserts a Categorization Rule and updates the Transaction, then emits changed', async () => {
    const component = createComponent([unmatched], [coffeeFlow]);
    const changed = vi.fn();
    component.changed.subscribe(changed);
    storage.getCategorizationRules.mockResolvedValue([
      { matchText: 'coffee shop', target: { kind: 'flow', id: 'flow-coffee' } },
    ]);

    component['openAssignForm'](unmatched);
    dialogClosed.next({ matchText: 'coffee shop', target: { kind: 'flow', id: 'flow-coffee' } });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(storage.upsertCategorizationRule).toHaveBeenCalledWith({
      matchText: 'coffee shop',
      target: { kind: 'flow', id: 'flow-coffee' },
    });
    expect(storage.upsertTransactions).toHaveBeenCalledWith([
      { ...unmatched, matchedTarget: { kind: 'flow', id: 'flow-coffee' } },
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
      { matchText: 'coffee shop', target: { kind: 'flow', id: 'flow-new' } },
    ]);

    component['openAssignForm'](unmatched);
    dialogClosed.next({
      matchText: 'coffee shop',
      target: { kind: 'flow', id: 'flow-new' },
      newFlow: brandNewFlow,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(storage.upsertFlow).toHaveBeenCalledWith(brandNewFlow);
    expect(storage.upsertCategorizationRule).toHaveBeenCalledWith({
      matchText: 'coffee shop',
      target: { kind: 'flow', id: 'flow-new' },
    });
  });

  it('recategorizes other currently loaded Transactions that now match the corrected rule', async () => {
    const otherCoffee: Transaction = {
      id: 'txn-3',
      accountId: 'acc-1',
      date: new Date('2026-07-18'),
      amount: -6,
      description: 'COFFEE SHOP #99',
      matchedTarget: null,
    };
    const component = createComponent([unmatched, otherCoffee], [coffeeFlow]);
    storage.getCategorizationRules.mockResolvedValue([
      { matchText: 'coffee shop', target: { kind: 'flow', id: 'flow-coffee' } },
    ]);

    component['openAssignForm'](unmatched);
    dialogClosed.next({ matchText: 'coffee shop', target: { kind: 'flow', id: 'flow-coffee' } });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(storage.upsertTransactions).toHaveBeenCalledWith([
      { ...unmatched, matchedTarget: { kind: 'flow', id: 'flow-coffee' } },
      { ...otherCoffee, matchedTarget: { kind: 'flow', id: 'flow-coffee' } },
    ]);
  });

  it('assigning a Transfer upserts a Categorization Rule targeting it', async () => {
    const component = createComponent([unmatched]);
    storage.getCategorizationRules.mockResolvedValue([
      { matchText: 'coffee shop', target: { kind: 'transfer', id: 'transfer-1' } },
    ]);

    component['openAssignForm'](unmatched);
    dialogClosed.next({ matchText: 'coffee shop', target: { kind: 'transfer', id: 'transfer-1' } });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(storage.upsertCategorizationRule).toHaveBeenCalledWith({
      matchText: 'coffee shop',
      target: { kind: 'transfer', id: 'transfer-1' },
    });
    expect(storage.upsertTransactions).toHaveBeenCalledWith([
      { ...unmatched, matchedTarget: { kind: 'transfer', id: 'transfer-1' } },
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
