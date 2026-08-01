import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { BudgetFlow, Flow, RecurringFlow } from '../../../core/models/flow';
import { Transaction } from '../../../core/models/transaction';
import { BudgetList } from './budget-list';

const groceries: BudgetFlow = {
  id: 'budget-1',
  accountId: 'acc-1',
  name: 'Groceries',
  direction: 'out',
  kind: 'budget',
  limit: 400,
  period: 'month',
};

const paycheck: RecurringFlow = {
  id: 'flow-1',
  accountId: 'acc-1',
  name: 'Paycheck',
  direction: 'in',
  kind: 'recurring',
  amount: 2000,
  cadence: { period: 'month', interval: 1, anchors: [{ day: 1 }], anchorDate: new Date('2026-01-01') },
};

function matchedTxn(id: string, amount: number, flowId: string): Transaction {
  return {
    id,
    accountId: 'acc-1',
    date: new Date(),
    amount,
    description: `txn-${id}`,
    matchedTarget: { kind: 'flow', id: flowId },
  };
}

describe('BudgetList', () => {
  async function createComponent(flows: Flow[] = [], transactions: Transaction[] = []) {
    await TestBed.configureTestingModule({ imports: [BudgetList] }).compileComponents();
    const fixture = TestBed.createComponent(BudgetList);
    fixture.componentRef.setInput('flows', flows);
    fixture.componentRef.setInput('transactions', transactions);
    fixture.detectChanges();
    return fixture;
  }

  it('renders nothing when there are no budget-kind Flows', async () => {
    const fixture = await createComponent([paycheck]);

    expect(fixture.nativeElement.querySelector('.budgets')).toBeNull();
  });

  it('renders one row per budget-kind Flow, ignoring recurring-kind Flows', async () => {
    const fixture = await createComponent([paycheck, groceries]);

    const rows = fixture.nativeElement.querySelectorAll('.budget-row');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('Groceries');
  });

  it('sizes the progress bar fill by used/limit', async () => {
    const fixture = await createComponent([groceries], [matchedTxn('t1', -100, groceries.id)]);

    const fill = fixture.nativeElement.querySelector('.progress-fill') as HTMLElement;
    expect(fill.style.width).toBe('25%');
  });

  it('caps the fill width at 100% when spend exceeds the limit', async () => {
    const fixture = await createComponent([groceries], [matchedTxn('t1', -600, groceries.id)]);

    const fill = fixture.nativeElement.querySelector('.progress-fill') as HTMLElement;
    expect(fill.style.width).toBe('100%');
  });

  it('emits budgetClick with the Flow when a row is clicked', async () => {
    const fixture = await createComponent([groceries]);

    const row = fixture.nativeElement.querySelector('.budget-row') as HTMLElement;
    let clicked: BudgetFlow | undefined;
    fixture.componentInstance.budgetClick.subscribe((flow: BudgetFlow) => (clicked = flow));
    row.click();

    expect(clicked).toEqual(groceries);
  });
});
