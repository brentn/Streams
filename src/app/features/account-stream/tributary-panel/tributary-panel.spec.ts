import { Dialog } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { Tributary } from '../../../core/charting/tributaries';
import { Account } from '../../../core/models/account';
import { RecurringFlow } from '../../../core/models/flow';
import { Transaction } from '../../../core/models/transaction';
import { Transfer } from '../../../core/models/transfer';
import { StorageRepository } from '../../../core/storage/storage-repository';
import { AssignFlowDialog, AssignFlowDialogResult } from '../transaction-review/assign-flow-dialog/assign-flow-dialog';
import { FlowFormDialog } from '../flow-form-dialog/flow-form-dialog';
import { TransferFormDialog } from '../transfer-form-dialog/transfer-form-dialog';
import { TributaryPanel } from './tributary-panel';

const account: Account = {
  id: 'acc-1',
  name: 'Checking',
  institutionName: 'Bank',
  balance: 0,
  balanceDate: new Date('2026-01-01'),
  expectedSign: 1,
  dryFloor: 0,
};
const otherAccount: Account = { ...account, id: 'acc-2', name: 'Savings' };
const accounts = [account, otherAccount];

const rentFlow: RecurringFlow = {
  id: 'flow-rent',
  accountId: 'acc-1',
  name: 'Rent',
  direction: 'out',
  kind: 'recurring',
  amount: 1500,
  cadence: { period: 'month', interval: 1, anchors: [{ day: 1 }], anchorDate: new Date('2026-01-01') },
};

const savingsTransfer: Transfer = {
  id: 'transfer-savings',
  fromAccountId: 'acc-1',
  toAccountId: 'acc-2',
  amount: 500,
  cadence: { period: 'month', interval: 1, anchors: [{ day: 15 }], anchorDate: new Date('2026-01-01') },
};

const flowTributary: Tributary = {
  id: 'flow-flow-rent-1',
  kind: 'flow',
  direction: 'out',
  date: new Date(2026, 6, 1),
  x: 1,
  amount: 1500,
  label: 'Rent',
  flowId: 'flow-rent',
};

const transferTributary: Tributary = {
  id: 'transfer-transfer-savings-1',
  kind: 'transfer',
  direction: 'out',
  date: new Date(2026, 6, 15),
  x: 1,
  amount: 500,
  label: '→ Savings',
  transferId: 'transfer-savings',
};

function txn(overrides: Partial<Transaction>): Transaction {
  return {
    id: 't1',
    accountId: 'acc-1',
    date: new Date(2026, 6, 1),
    amount: -1500,
    description: 'RENT PAYMENT',
    matchedTarget: null,
    ...overrides,
  };
}

describe('TributaryPanel', () => {
  let storage: {
    upsertFlow: ReturnType<typeof vi.fn>;
    upsertTransfer: ReturnType<typeof vi.fn>;
    upsertCategorizationRule: ReturnType<typeof vi.fn>;
    getCategorizationRules: ReturnType<typeof vi.fn>;
    upsertTransactions: ReturnType<typeof vi.fn>;
  };
  let dialog: { open: ReturnType<typeof vi.fn> };

  async function createComponent(opts: {
    tributary: Tributary;
    transactions?: Transaction[];
    flows?: RecurringFlow[];
    transfers?: Transfer[];
    selectedDate?: Date;
  }) {
    storage = {
      upsertFlow: vi.fn().mockResolvedValue(undefined),
      upsertTransfer: vi.fn().mockResolvedValue(undefined),
      upsertCategorizationRule: vi.fn().mockResolvedValue(undefined),
      getCategorizationRules: vi.fn().mockResolvedValue([]),
      upsertTransactions: vi.fn().mockResolvedValue(undefined),
    };
    dialog = { open: vi.fn() };
    Element.prototype.scrollIntoView = vi.fn();

    await TestBed.configureTestingModule({
      imports: [TributaryPanel],
      providers: [
        { provide: StorageRepository, useValue: storage },
        { provide: Dialog, useValue: dialog },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(TributaryPanel);
    fixture.componentRef.setInput('accountId', 'acc-1');
    fixture.componentRef.setInput('tributary', opts.tributary);
    fixture.componentRef.setInput('flows', opts.flows ?? [rentFlow]);
    fixture.componentRef.setInput('transfers', opts.transfers ?? [savingsTransfer]);
    fixture.componentRef.setInput('accounts', accounts);
    fixture.componentRef.setInput('transactions', opts.transactions ?? []);
    fixture.componentRef.setInput('selectedDate', opts.selectedDate ?? new Date(2026, 6, 15));
    fixture.detectChanges();
    return { component: fixture.componentInstance, fixture };
  }

  it('resolves the Flow from the tributary\'s flowId', async () => {
    const { component } = await createComponent({ tributary: flowTributary });

    expect(component['flow']()).toEqual(rentFlow);
    expect(component['transfer']()).toBeNull();
    expect(component['targetLabel']()).toBe('Rent');
  });

  it('resolves the Transfer from the tributary\'s transferId, labeled from this account', async () => {
    const { component } = await createComponent({ tributary: transferTributary });

    expect(component['transfer']()).toEqual(savingsTransfer);
    expect(component['flow']()).toBeNull();
    expect(component['targetLabel']()).toBe('Transfer to Savings');
  });

  it('groups matching Transactions by calendar day, sorted chronologically', async () => {
    const t1 = txn({ id: 't1', date: new Date(2026, 6, 1), matchedTarget: { kind: 'flow', id: 'flow-rent' } });
    const t2 = txn({
      id: 't2',
      date: new Date(2026, 6, 1, 18),
      matchedTarget: { kind: 'flow', id: 'flow-rent' },
    });
    const t3 = txn({ id: 't3', date: new Date(2026, 5, 1), matchedTarget: { kind: 'flow', id: 'flow-rent' } });
    const unrelated = txn({ id: 't4', matchedTarget: { kind: 'flow', id: 'flow-other' } });

    const { component } = await createComponent({
      tributary: flowTributary,
      transactions: [t1, t2, t3, unrelated],
    });

    const groups = component['dayGroups']();
    expect(groups).toHaveLength(2);
    expect(groups[0].date).toEqual(new Date(2026, 5, 1));
    expect(groups[1].date).toEqual(new Date(2026, 6, 1));
    expect(groups[1].transactions).toEqual([t1, t2]);
  });

  it('filters to only Transactions matching this Transfer', async () => {
    const matching = txn({
      id: 't1',
      date: new Date(2026, 6, 15),
      matchedTarget: { kind: 'transfer', id: 'transfer-savings' },
    });
    const flowMatched = txn({ id: 't2', matchedTarget: { kind: 'flow', id: 'flow-rent' } });

    const { component } = await createComponent({
      tributary: transferTributary,
      transactions: [matching, flowMatched],
    });

    expect(component['dayGroups']()).toEqual([{ date: new Date(2026, 6, 15), transactions: [matching] }]);
  });

  it('opens FlowFormDialog pre-filled with the Flow on Edit, and persists the saved result', async () => {
    const { component } = await createComponent({ tributary: flowTributary });
    const savedFlow = { ...rentFlow, amount: 1600 };
    const closed = new Subject<typeof savedFlow | undefined>();
    dialog.open.mockReturnValue({ closed });

    component['editItem']();

    expect(dialog.open).toHaveBeenCalledWith(FlowFormDialog, {
      data: { accountId: 'acc-1', flow: rentFlow },
    });

    closed.next(savedFlow);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(storage.upsertFlow).toHaveBeenCalledWith(savedFlow);
  });

  it('opens TransferFormDialog pre-filled with the Transfer on Edit, and persists the saved result', async () => {
    const { component } = await createComponent({ tributary: transferTributary });
    const savedTransfer = { ...savingsTransfer, amount: 600 };
    const closed = new Subject<typeof savedTransfer | undefined>();
    dialog.open.mockReturnValue({ closed });

    component['editItem']();

    expect(dialog.open).toHaveBeenCalledWith(TransferFormDialog, {
      data: { accountId: 'acc-1', accounts, transfer: savingsTransfer },
    });

    closed.next(savedTransfer);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(storage.upsertTransfer).toHaveBeenCalledWith(savedTransfer);
  });

  it('emits changed after a successful edit', async () => {
    const { component } = await createComponent({ tributary: flowTributary });
    const changed = vi.fn();
    component.changed.subscribe(changed);
    const closed = new Subject<RecurringFlow | undefined>();
    dialog.open.mockReturnValue({ closed });

    component['editItem']();
    closed.next({ ...rentFlow, amount: 1600 });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(changed).toHaveBeenCalled();
  });

  it('does not persist or emit changed when Edit is cancelled', async () => {
    const { component } = await createComponent({ tributary: flowTributary });
    const changed = vi.fn();
    component.changed.subscribe(changed);
    const closed = new Subject<RecurringFlow | undefined>();
    dialog.open.mockReturnValue({ closed });

    component['editItem']();
    closed.next(undefined);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(storage.upsertFlow).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
  });

  it('opens AssignFlowDialog for a row and applies the result, emitting changed', async () => {
    const matching = txn({ matchedTarget: { kind: 'flow', id: 'flow-rent' } });
    const { component } = await createComponent({ tributary: flowTributary, transactions: [matching] });
    const changed = vi.fn();
    component.changed.subscribe(changed);
    const closed = new Subject<AssignFlowDialogResult | undefined>();
    dialog.open.mockReturnValue({ closed });
    storage.getCategorizationRules.mockResolvedValue([
      { matchText: 'rent payment', target: { kind: 'flow', id: 'flow-rent' } },
    ]);

    component['openAssignForm'](matching);

    expect(dialog.open).toHaveBeenCalledWith(AssignFlowDialog, {
      data: { transaction: matching, flows: [rentFlow], transfers: [savingsTransfer], accounts },
    });

    closed.next({ matchText: 'rent payment', target: { kind: 'flow', id: 'flow-rent' } });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(storage.upsertCategorizationRule).toHaveBeenCalled();
    expect(changed).toHaveBeenCalled();
  });

  it('emits closed when the close button is used', async () => {
    const { component } = await createComponent({ tributary: flowTributary });
    const closedEmit = vi.fn();
    component.closed.subscribe(closedEmit);

    component['close']();

    expect(closedEmit).toHaveBeenCalled();
  });
});
