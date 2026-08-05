import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { CategorizationRule } from '../../../../core/models/categorization-rule';
import { RecurringFlow } from '../../../../core/models/flow';
import { Transaction } from '../../../../core/models/transaction';
import {
  ResolveOutstandingDialog,
  ResolveOutstandingDialogData,
} from './resolve-outstanding-dialog';

const rent: RecurringFlow = {
  id: 'flow-rent',
  accountId: 'acc-1',
  name: 'Rent',
  direction: 'out',
  kind: 'recurring',
  amount: 1200,
  cadence: { period: 'month', interval: 1, anchors: [{ day: 1 }], anchorDate: new Date('2026-01-01') },
};

const occurrenceDate = new Date('2026-07-01');

function txn(id: string, amount: number, date: Date, description: string): Transaction {
  return { id, accountId: 'acc-1', date, amount, description, matchedTarget: null };
}

describe('ResolveOutstandingDialog', () => {
  let dialogRef: { close: ReturnType<typeof vi.fn> };

  function createComponent(data: Partial<ResolveOutstandingDialogData> & { flow: RecurringFlow }) {
    dialogRef = { close: vi.fn() };
    const fullData: ResolveOutstandingDialogData = {
      occurrenceDate,
      amount: 1200,
      transactions: [],
      categorizationRules: [],
      ...data,
    };
    TestBed.configureTestingModule({
      imports: [ResolveOutstandingDialog],
      providers: [
        { provide: DialogRef, useValue: dialogRef },
        { provide: DIALOG_DATA, useValue: fullData },
      ],
    });
    return TestBed.createComponent(ResolveOutstandingDialog).componentInstance;
  }

  it('ranks candidates via rankMatchCandidates, best match first', () => {
    const rules: CategorizationRule[] = [{ matchText: 'landlord llc', target: { kind: 'flow', id: 'flow-rent' } }];
    const ruleMatch = txn('t1', -1200, occurrenceDate, 'LANDLORD LLC AUTOPAY');
    const weakMatch = txn('t2', -1200, occurrenceDate, 'UNRELATED PAYEE');
    const component = createComponent({ flow: rent, transactions: [weakMatch, ruleMatch], categorizationRules: rules });

    expect(component['candidates']().map((c) => c.transaction.id)).toEqual(['t1', 't2']);
  });

  it('has no selected Transaction initially', () => {
    const component = createComponent({ flow: rent });

    expect(component['selectedTransaction']()).toBeNull();
  });

  it('selecting a candidate defaults match text to its full description', () => {
    const candidate = txn('t1', -1200, occurrenceDate, 'LANDLORD LLC AUTOPAY');
    const component = createComponent({ flow: rent, transactions: [candidate] });

    component['selectCandidate'](candidate);

    expect(component['selectedTransaction']()).toEqual(candidate);
    expect(component['matchText']()).toBe('LANDLORD LLC AUTOPAY');
  });

  it('returns to the candidate list on back, clearing the selection', () => {
    const candidate = txn('t1', -1200, occurrenceDate, 'LANDLORD LLC AUTOPAY');
    const component = createComponent({ flow: rent, transactions: [candidate] });
    component['selectCandidate'](candidate);

    component['backToCandidates']();

    expect(component['selectedTransaction']()).toBeNull();
  });

  it('closes with an assign result on confirm, using the normalized match text', () => {
    const candidate = txn('t1', -1200, occurrenceDate, 'LANDLORD LLC AUTOPAY');
    const component = createComponent({ flow: rent, transactions: [candidate] });
    component['selectCandidate'](candidate);
    component['matchText'].set('  Landlord LLC  ');

    component['confirmAssign'](new Event('submit'));

    expect(dialogRef.close).toHaveBeenCalledWith({
      kind: 'assign',
      matchText: 'landlord llc',
      target: { kind: 'flow', id: 'flow-rent' },
    });
  });

  it('rejects match text that is not a substring of the selected Transaction description', () => {
    const candidate = txn('t1', -1200, occurrenceDate, 'LANDLORD LLC AUTOPAY');
    const component = createComponent({ flow: rent, transactions: [candidate] });
    component['selectCandidate'](candidate);
    component['matchText'].set('totally unrelated text');

    component['confirmAssign'](new Event('submit'));

    expect(dialogRef.close).not.toHaveBeenCalled();
    expect(component['formError']()).toContain("transaction's description");
  });

  it('does not close when match text is blank', () => {
    const candidate = txn('t1', -1200, occurrenceDate, 'LANDLORD LLC AUTOPAY');
    const component = createComponent({ flow: rent, transactions: [candidate] });
    component['selectCandidate'](candidate);
    component['matchText'].set('   ');

    component['confirmAssign'](new Event('submit'));

    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('closes with a skip result, without requiring a selected candidate', () => {
    const component = createComponent({ flow: rent, occurrenceDate });

    component['skip']();

    expect(dialogRef.close).toHaveBeenCalledWith({
      kind: 'skip',
      flowId: 'flow-rent',
      occurrenceDate,
    });
  });

  it('closes with no result on cancel', () => {
    const component = createComponent({ flow: rent });

    component['cancel']();

    expect(dialogRef.close).toHaveBeenCalledWith();
  });
});
