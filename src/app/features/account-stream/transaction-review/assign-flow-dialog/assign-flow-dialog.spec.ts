import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RecurringFlow } from '../../../../core/models/flow';
import { Transaction } from '../../../../core/models/transaction';
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

const matched: Transaction = {
  id: 'txn-2',
  accountId: 'acc-1',
  date: new Date('2026-07-19'),
  amount: 2000,
  description: 'PAYROLL DEPOSIT',
  matchedFlowId: 'flow-payroll',
};

const unmatched: Transaction = {
  id: 'txn-1',
  accountId: 'acc-1',
  date: new Date('2026-07-20'),
  amount: -4.5,
  description: 'COFFEE SHOP #42',
  matchedFlowId: null,
};

describe('AssignFlowDialog', () => {
  let dialogRef: { close: ReturnType<typeof vi.fn> };

  function createComponent(data: AssignFlowDialogData) {
    dialogRef = { close: vi.fn() };
    TestBed.configureTestingModule({
      imports: [AssignFlowDialog],
      providers: [
        { provide: DialogRef, useValue: dialogRef },
        { provide: DIALOG_DATA, useValue: data },
      ],
    });
    return TestBed.createComponent(AssignFlowDialog).componentInstance;
  }

  it('pre-fills match text and Flow from the given Transaction', () => {
    const component = createComponent({ transaction: matched, flows: [payrollFlow, coffeeFlow] });

    expect(component['matchText']()).toBe('PAYROLL DEPOSIT');
    expect(component['selectedFlowId']()).toBe('flow-payroll');
  });

  it('defaults to the first Flow when the Transaction has no current match', () => {
    const component = createComponent({ transaction: unmatched, flows: [coffeeFlow] });

    expect(component['selectedFlowId']()).toBe('flow-coffee');
  });

  it('closes with the normalized match text and chosen Flow on submit', () => {
    const component = createComponent({ transaction: unmatched, flows: [coffeeFlow] });
    component['matchText'].set('  Coffee Shop  ');
    component['selectedFlowId'].set('flow-coffee');

    component['onSubmit'](new Event('submit'));

    expect(dialogRef.close).toHaveBeenCalledWith({ matchText: 'coffee shop', flowId: 'flow-coffee' });
  });

  it('rejects match text that is not a substring of the Transaction description', () => {
    const component = createComponent({ transaction: unmatched, flows: [coffeeFlow] });
    component['matchText'].set('totally unrelated text');
    component['selectedFlowId'].set('flow-coffee');

    component['onSubmit'](new Event('submit'));

    expect(dialogRef.close).not.toHaveBeenCalled();
    expect(component['formError']()).toContain("transaction's description");
  });

  it('does not close when match text is blank', () => {
    const component = createComponent({ transaction: unmatched, flows: [coffeeFlow] });
    component['matchText'].set('   ');
    component['selectedFlowId'].set('flow-coffee');

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
      expect(component['selectedFlowId']()).toBe('flow-new');
      expect(component['isCreatingFlow']()).toBe(false);
    });

    it('includes the new Flow in the close result when it is still selected at submit time', () => {
      const component = createComponent({ transaction: unmatched, flows: [coffeeFlow] });
      component['onFlowCreated'](newFlow);
      component['matchText'].set('coffee shop');

      component['onSubmit'](new Event('submit'));

      expect(dialogRef.close).toHaveBeenCalledWith({
        matchText: 'coffee shop',
        flowId: 'flow-new',
        newFlow,
      });
    });

    it('does not include the new Flow if the user switches back to an existing Flow before submitting', () => {
      const component = createComponent({ transaction: unmatched, flows: [coffeeFlow] });
      component['onFlowCreated'](newFlow);
      component['selectedFlowId'].set('flow-coffee');
      component['matchText'].set('coffee shop');

      component['onSubmit'](new Event('submit'));

      expect(dialogRef.close).toHaveBeenCalledWith({
        matchText: 'coffee shop',
        flowId: 'flow-coffee',
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
      component['selectedFlowId'].set('flow-new');
      component['matchText'].set('coffee shop');

      component['onSubmit'](new Event('submit'));

      expect(dialogRef.close).toHaveBeenCalledWith({
        matchText: 'coffee shop',
        flowId: 'flow-new',
        newFlow,
      });
    });
  });
});
