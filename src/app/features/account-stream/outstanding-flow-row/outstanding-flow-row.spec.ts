import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { Account } from '../../../core/models/account';
import { Flow, RecurringFlow } from '../../../core/models/flow';
import { SkippedOccurrence } from '../../../core/models/skipped-occurrence';
import { Transaction } from '../../../core/models/transaction';
import { OutstandingFlowRow } from './outstanding-flow-row';

const account: Account = {
  id: 'acc-1',
  name: 'Checking',
  institutionName: 'Bank',
  balance: 1000,
  balanceDate: new Date(),
  expectedSign: 1,
  dryFloor: 0,
};

const now = new Date();
const daysAgo = (n: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - n);

function onceFlow(id: string, name: string, direction: 'in' | 'out', occurrence: Date): RecurringFlow {
  return {
    id,
    accountId: 'acc-1',
    name,
    direction,
    kind: 'recurring',
    amount: 100,
    cadence: { period: 'once', date: occurrence },
  };
}

describe('OutstandingFlowRow', () => {
  async function createComponent(
    flows: Flow[] = [],
    transactions: Transaction[] = [],
    skippedOccurrences: SkippedOccurrence[] = [],
  ) {
    await TestBed.configureTestingModule({ imports: [OutstandingFlowRow] }).compileComponents();
    const fixture = TestBed.createComponent(OutstandingFlowRow);
    fixture.componentRef.setInput('flows', flows);
    fixture.componentRef.setInput('transactions', transactions);
    fixture.componentRef.setInput('account', account);
    fixture.componentRef.setInput('skippedOccurrences', skippedOccurrences);
    fixture.detectChanges();
    return fixture;
  }

  it('renders nothing when there are no Outstanding Flows', async () => {
    const notYetDue = onceFlow('f1', 'Rent', 'out', daysAgo(-3));
    const fixture = await createComponent([notYetDue]);

    expect(fixture.nativeElement.querySelector('.outstanding-row')).toBeNull();
  });

  it('renders a tile for a currently-Outstanding recurring Flow, showing its due date and name', async () => {
    const rent = onceFlow('f1', 'Rent', 'out', daysAgo(3));
    const fixture = await createComponent([rent]);

    const tiles = fixture.nativeElement.querySelectorAll('.tile');
    expect(tiles.length).toBe(1);
    expect(tiles[0].textContent).toContain('Rent');
  });

  it('includes an Outstanding income Flow, not just expense Flows', async () => {
    const paycheck = onceFlow('f1', 'Paycheck', 'in', daysAgo(3));
    const fixture = await createComponent([paycheck]);

    const tiles = fixture.nativeElement.querySelectorAll('.tile');
    expect(tiles.length).toBe(1);
    expect(tiles[0].textContent).toContain('Paycheck');
  });

  it('excludes a Flow whose occurrence has a matching Transaction', async () => {
    const rent = onceFlow('f1', 'Rent', 'out', daysAgo(3));
    const matched: Transaction = {
      id: 'txn-1',
      accountId: 'acc-1',
      date: daysAgo(3),
      amount: -100,
      description: 'rent payment',
      matchedTarget: { kind: 'flow', id: 'f1' },
    };
    const fixture = await createComponent([rent], [matched]);

    expect(fixture.nativeElement.querySelector('.outstanding-row')).toBeNull();
  });

  it('excludes a Flow occurrence recorded as a Skipped Occurrence (#95)', async () => {
    const rent = onceFlow('f1', 'Rent', 'out', daysAgo(3));
    const skipped: SkippedOccurrence = { flowId: 'f1', occurrenceDate: daysAgo(3) };
    const fixture = await createComponent([rent], [], [skipped]);

    expect(fixture.nativeElement.querySelector('.outstanding-row')).toBeNull();
  });

  it('excludes a budget-kind Flow, which has no single occurrence to be Outstanding', async () => {
    const budget: Flow = {
      id: 'f1',
      accountId: 'acc-1',
      name: 'Groceries',
      direction: 'out',
      kind: 'budget',
      limit: 400,
      period: 'month',
    };
    const fixture = await createComponent([budget]);

    expect(fixture.nativeElement.querySelector('.outstanding-row')).toBeNull();
  });

  it('orders tiles oldest-occurrence-first', async () => {
    const recent = onceFlow('f1', 'Recent', 'out', daysAgo(1));
    const older = onceFlow('f2', 'Older', 'out', daysAgo(5));
    const fixture = await createComponent([recent, older]);

    const names = Array.from(fixture.nativeElement.querySelectorAll('.name')).map(
      (el) => (el as HTMLElement).textContent,
    );
    expect(names).toEqual(['Older', 'Recent']);
  });
});
