import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Account } from '../../../../core/models/account';
import { RecurringFlow } from '../../../../core/models/flow';
import { Transaction } from '../../../../core/models/transaction';
import { Transfer } from '../../../../core/models/transfer';
import { AssignFlowDialog, AssignFlowDialogData } from './assign-flow-dialog';

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

const toSavings: Transfer = {
  id: 'transfer-1',
  fromAccountId: 'acc-1',
  toAccountId: 'acc-2',
  amount: 500,
  cadence: { period: 'month', interval: 1, anchors: [{ day: 1 }], anchorDate: new Date('2026-01-01') },
};

const accounts: Account[] = [
  { id: 'acc-1', name: 'Checking', institutionName: 'Bank', balance: 0, balanceDate: new Date(), expectedSign: 1, dryFloor: 0 },
  { id: 'acc-2', name: 'Savings', institutionName: 'Bank', balance: 0, balanceDate: new Date(), expectedSign: 1, dryFloor: 0 },
];

const oneTimeBonus: RecurringFlow = {
  id: 'flow-onetime',
  accountId: 'acc-1',
  name: 'Bonus',
  direction: 'in',
  kind: 'recurring',
  amount: 300,
  cadence: { period: 'once', date: new Date('2026-07-10') },
};

const matched: Transaction = {
  id: 'txn-2',
  accountId: 'acc-1',
  date: new Date('2026-07-19'),
  amount: 2000,
  description: 'PAYROLL DEPOSIT',
  matchedTarget: { kind: 'flow', id: 'flow-payroll' },
};

const unmatched: Transaction = {
  id: 'txn-1',
  accountId: 'acc-1',
  date: new Date('2026-07-20'),
  amount: -4.5,
  description: 'COFFEE SHOP #42',
  matchedTarget: null,
};

describe('AssignFlowDialog', () => {
  let dialogRef: { close: ReturnType<typeof vi.fn> };

  function createComponent(data: Partial<AssignFlowDialogData> & { transaction: Transaction }) {
    dialogRef = { close: vi.fn() };
    const fullData: AssignFlowDialogData = {
      flows: [],
      transfers: [],
      accounts,
      transactions: [],
      hasDirectCategorization: false,
      ...data,
    };
    TestBed.configureTestingModule({
      imports: [AssignFlowDialog],
      providers: [
        { provide: DialogRef, useValue: dialogRef },
        { provide: DIALOG_DATA, useValue: fullData },
      ],
    });
    return TestBed.createComponent(AssignFlowDialog).componentInstance;
  }

  it('pre-fills match text and the selected target from the given Transaction', () => {
    const component = createComponent({ transaction: matched, flows: [payrollFlow, coffeeFlow] });

    expect(component['matchText']()).toBe('PAYROLL DEPOSIT');
    expect(component['selectedTarget']()).toEqual({ kind: 'flow', id: 'flow-payroll' });
  });

  it('defaults to the first Flow when the Transaction has no current match', () => {
    const component = createComponent({ transaction: unmatched, flows: [coffeeFlow] });

    expect(component['selectedTarget']()).toEqual({ kind: 'flow', id: 'flow-coffee' });
  });

  it('defaults to the first Transfer when there are no Flows', () => {
    const component = createComponent({ transaction: unmatched, transfers: [toSavings] });

    expect(component['selectedTarget']()).toEqual({ kind: 'transfer', id: 'transfer-1' });
  });

  it('pre-fills a Transfer target from the given Transaction', () => {
    const transferMatched: Transaction = {
      ...unmatched,
      matchedTarget: { kind: 'transfer', id: 'transfer-1' },
    };
    const component = createComponent({ transaction: transferMatched, transfers: [toSavings] });

    expect(component['selectedTarget']()).toEqual({ kind: 'transfer', id: 'transfer-1' });
  });

  it('labels a Transfer by the other Account and its nearest occurrence to this Transaction\'s date', () => {
    const component = createComponent({ transaction: unmatched, transfers: [toSavings] });

    // toSavings is monthly on the 1st; unmatched is dated 2026-07-20, so the nearest
    // at-or-before occurrence is 2026-07-01.
    expect(component['transferLabel'](toSavings)).toBe('Transfer to Savings — Jul 1, 2026');
  });

  it('closes with the normalized match text and chosen Flow target on submit', () => {
    const component = createComponent({ transaction: unmatched, flows: [coffeeFlow] });
    component['matchText'].set('  Coffee Shop  ');
    component['selectedTarget'].set({ kind: 'flow', id: 'flow-coffee' });

    component['onSubmit'](new Event('submit'));

    expect(dialogRef.close).toHaveBeenCalledWith({
      mode: 'rule',
      matchText: 'coffee shop',
      target: { kind: 'flow', id: 'flow-coffee' },
      newFlow: undefined,
    });
  });

  it('closes with a Transfer target on submit', () => {
    const component = createComponent({ transaction: unmatched, transfers: [toSavings] });
    component['matchText'].set('coffee shop');
    component['selectedTarget'].set({ kind: 'transfer', id: 'transfer-1' });

    component['onSubmit'](new Event('submit'));

    expect(dialogRef.close).toHaveBeenCalledWith({
      mode: 'rule',
      matchText: 'coffee shop',
      target: { kind: 'transfer', id: 'transfer-1' },
      newFlow: undefined,
    });
  });

  it('rejects match text that is not a substring of the Transaction description', () => {
    const component = createComponent({ transaction: unmatched, flows: [coffeeFlow] });
    component['matchText'].set('totally unrelated text');
    component['selectedTarget'].set({ kind: 'flow', id: 'flow-coffee' });

    component['onSubmit'](new Event('submit'));

    expect(dialogRef.close).not.toHaveBeenCalled();
    expect(component['formError']()).toContain("transaction's description");
  });

  it('does not close when match text is blank', () => {
    const component = createComponent({ transaction: unmatched, flows: [coffeeFlow] });
    component['matchText'].set('   ');
    component['selectedTarget'].set({ kind: 'flow', id: 'flow-coffee' });

    component['onSubmit'](new Event('submit'));

    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('closes with no result on cancel', () => {
    const component = createComponent({ transaction: unmatched, flows: [coffeeFlow] });

    component['cancel']();

    expect(dialogRef.close).toHaveBeenCalledWith();
  });

  describe('creating a new Flow inline', () => {
    const newFlow: RecurringFlow = {
      id: 'flow-new',
      accountId: 'acc-1',
      name: 'Coffee',
      direction: 'out',
      kind: 'recurring',
      amount: 5,
      cadence: { period: 'week', interval: 1, anchors: [{ dayOfWeek: 1 }], anchorDate: new Date('2026-01-05') },
    };

    it('shows the Flow creation form on "+ New Flow"', () => {
      const component = createComponent({ transaction: unmatched, flows: [coffeeFlow] });

      component['startCreatingFlow']();

      expect(component['isCreatingFlow']()).toBe(true);
    });

    it('adds the created Flow to the list, selects it, and hides the creation form', () => {
      const component = createComponent({ transaction: unmatched, flows: [coffeeFlow] });
      component['startCreatingFlow']();

      component['onFlowCreated'](newFlow);

      expect(component['flows']()).toEqual([coffeeFlow, newFlow]);
      expect(component['selectedTarget']()).toEqual({ kind: 'flow', id: 'flow-new' });
      expect(component['isCreatingFlow']()).toBe(false);
    });

    it('includes the new Flow in the close result when it is still selected at submit time', () => {
      const component = createComponent({ transaction: unmatched, flows: [coffeeFlow] });
      component['onFlowCreated'](newFlow);
      component['matchText'].set('coffee shop');

      component['onSubmit'](new Event('submit'));

      expect(dialogRef.close).toHaveBeenCalledWith({
        mode: 'rule',
        matchText: 'coffee shop',
        target: { kind: 'flow', id: 'flow-new' },
        newFlow,
      });
    });

    it('does not include the new Flow if the user switches back to an existing Flow before submitting', () => {
      const component = createComponent({ transaction: unmatched, flows: [coffeeFlow] });
      component['onFlowCreated'](newFlow);
      component['selectedTarget'].set({ kind: 'flow', id: 'flow-coffee' });
      component['matchText'].set('coffee shop');

      component['onSubmit'](new Event('submit'));

      expect(dialogRef.close).toHaveBeenCalledWith({
        mode: 'rule',
        matchText: 'coffee shop',
        target: { kind: 'flow', id: 'flow-coffee' },
        newFlow: undefined,
      });
    });

    it('cancelling Flow creation hides the form without adding anything', () => {
      const component = createComponent({ transaction: unmatched, flows: [coffeeFlow] });
      component['startCreatingFlow']();

      component['onFlowCreationCancelled']();

      expect(component['isCreatingFlow']()).toBe(false);
      expect(component['flows']()).toEqual([coffeeFlow]);
    });

    it('resolves the correct Flow when switching back to an earlier one created in the same session', () => {
      const secondNewFlow: RecurringFlow = { ...newFlow, id: 'flow-new-2', name: 'Gas' };
      const component = createComponent({ transaction: unmatched, flows: [coffeeFlow] });

      component['onFlowCreated'](newFlow);
      component['startCreatingFlow']();
      component['onFlowCreated'](secondNewFlow);
      // Switch back to the first Flow created in this session, not the most recent one.
      component['selectedTarget'].set({ kind: 'flow', id: 'flow-new' });
      component['matchText'].set('coffee shop');

      component['onSubmit'](new Event('submit'));

      expect(dialogRef.close).toHaveBeenCalledWith({
        mode: 'rule',
        matchText: 'coffee shop',
        target: { kind: 'flow', id: 'flow-new' },
        newFlow,
      });
    });
  });

  describe('available Flow options', () => {
    it('sorts Flows alphabetically by name', () => {
      const component = createComponent({ transaction: unmatched, flows: [payrollFlow, coffeeFlow] });

      expect(component['availableFlows']()).toEqual([coffeeFlow, payrollFlow]);
    });

    it('excludes a one-time Flow once any Transaction is matched to it', () => {
      const component = createComponent({
        transaction: unmatched,
        flows: [coffeeFlow, oneTimeBonus],
        transactions: [matched, { ...unmatched, id: 'txn-3', matchedTarget: { kind: 'flow', id: 'flow-onetime' } }],
      });

      expect(component['availableFlows']()).toEqual([coffeeFlow]);
    });

    it('excludes a one-time Flow even for the Transaction it is already assigned to', () => {
      const alreadyAssigned: Transaction = {
        ...unmatched,
        matchedTarget: { kind: 'flow', id: 'flow-onetime' },
      };
      const component = createComponent({
        transaction: alreadyAssigned,
        flows: [coffeeFlow, oneTimeBonus],
        transactions: [alreadyAssigned],
      });

      expect(component['availableFlows']()).toEqual([coffeeFlow]);
    });

    it('does not exclude a non-one-time recurring or budget Flow even when matched', () => {
      const component = createComponent({
        transaction: unmatched,
        flows: [coffeeFlow, payrollFlow],
        transactions: [matched],
      });

      expect(component['availableFlows']()).toEqual([coffeeFlow, payrollFlow]);
    });

    it('inserts a Flow created inline in sorted position', () => {
      const component = createComponent({ transaction: unmatched, flows: [payrollFlow] });
      const alphaFlow: RecurringFlow = { ...coffeeFlow, id: 'flow-alpha', name: 'Alpha' };

      component['onFlowCreated'](alphaFlow);

      expect(component['availableFlows']()).toEqual([alphaFlow, payrollFlow]);
    });

    it('defaults selection to the first available (filtered, sorted) Flow when the Transaction has no current match', () => {
      const component = createComponent({
        transaction: unmatched,
        flows: [payrollFlow, coffeeFlow, oneTimeBonus],
        transactions: [{ ...unmatched, id: 'txn-3', matchedTarget: { kind: 'flow', id: 'flow-onetime' } }],
      });

      expect(component['selectedTarget']()).toEqual({ kind: 'flow', id: 'flow-coffee' });
    });
  });

  describe('mode', () => {
    it('defaults to rule mode', () => {
      const component = createComponent({ transaction: unmatched, flows: [coffeeFlow] });

      expect(component['mode']()).toBe('rule');
    });

    it('closes with a direct-mode result — no matchText — when mode is direct', () => {
      const component = createComponent({ transaction: unmatched, flows: [coffeeFlow] });
      component['mode'].set('direct');
      component['selectedTarget'].set({ kind: 'flow', id: 'flow-coffee' });

      component['onSubmit'](new Event('submit'));

      expect(dialogRef.close).toHaveBeenCalledWith({
        mode: 'direct',
        transactionId: 'txn-1',
        target: { kind: 'flow', id: 'flow-coffee' },
      });
    });

    it('does not require match text to be a substring of the description when in direct mode', () => {
      const component = createComponent({ transaction: unmatched, flows: [coffeeFlow] });
      component['mode'].set('direct');
      component['matchText'].set('totally unrelated text');
      component['selectedTarget'].set({ kind: 'flow', id: 'flow-coffee' });

      component['onSubmit'](new Event('submit'));

      expect(dialogRef.close).toHaveBeenCalledWith({
        mode: 'direct',
        transactionId: 'txn-1',
        target: { kind: 'flow', id: 'flow-coffee' },
      });
    });

    it('includes a Flow created inline in the direct-mode result when it is still selected at submit time', () => {
      const newFlow: RecurringFlow = {
        id: 'flow-new',
        accountId: 'acc-1',
        name: 'Coffee',
        direction: 'out',
        kind: 'recurring',
        amount: 5,
        cadence: { period: 'week', interval: 1, anchors: [{ dayOfWeek: 1 }], anchorDate: new Date('2026-01-05') },
      };
      const component = createComponent({ transaction: unmatched, flows: [coffeeFlow] });
      component['onFlowCreated'](newFlow);
      component['mode'].set('direct');

      component['onSubmit'](new Event('submit'));

      expect(dialogRef.close).toHaveBeenCalledWith({
        mode: 'direct',
        transactionId: 'txn-1',
        target: { kind: 'flow', id: 'flow-new' },
        newFlow,
      });
    });

    it('does not close in direct mode when no target is selected', () => {
      const component = createComponent({ transaction: unmatched, flows: [], transfers: [] });
      component['mode'].set('direct');

      component['onSubmit'](new Event('submit'));

      expect(dialogRef.close).not.toHaveBeenCalled();
    });
  });

  describe('removing a Direct Categorization', () => {
    it('does not offer removal when the Transaction has no Direct Categorization', () => {
      const component = createComponent({ transaction: unmatched, flows: [coffeeFlow], hasDirectCategorization: false });

      expect(component['data'].hasDirectCategorization).toBe(false);
    });

    it('closes with a remove-direct result', () => {
      const component = createComponent({ transaction: unmatched, flows: [coffeeFlow], hasDirectCategorization: true });

      component['removeDirectCategorization']();

      expect(dialogRef.close).toHaveBeenCalledWith({ mode: 'remove-direct', transactionId: 'txn-1' });
    });
  });
});
