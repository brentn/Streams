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
  cadence: {
    period: 'month',
    interval: 1,
    anchors: [{ day: 1 }],
    anchorDate: new Date('2026-01-01'),
  },
};

function matchedTxn(
  id: string,
  amount: number,
  flowId: string,
  date: Date = new Date(),
): Transaction {
  return {
    id,
    accountId: 'acc-1',
    date,
    amount,
    description: `txn-${id}`,
    matchedTarget: { kind: 'flow', id: flowId },
  };
}

describe('BudgetList', () => {
  async function createComponent(
    flows: Flow[] = [],
    transactions: Transaction[] = [],
    selectedDate: Date = new Date(),
  ) {
    await TestBed.configureTestingModule({ imports: [BudgetList] }).compileComponents();
    const fixture = TestBed.createComponent(BudgetList);
    fixture.componentRef.setInput('flows', flows);
    fixture.componentRef.setInput('transactions', transactions);
    fixture.componentRef.setInput('selectedDate', selectedDate);
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

  it('caps the fill width at 100% when spend exceeds the limit, but shows the true percentage as text', async () => {
    const fixture = await createComponent([groceries], [matchedTxn('t1', -600, groceries.id)]);

    const fill = fixture.nativeElement.querySelector('.progress-fill') as HTMLElement;
    expect(fill.style.width).toBe('100%');
    const pct = fixture.nativeElement.querySelector('.pct') as HTMLElement;
    expect(pct.textContent).toContain('150%');
  });

  it('emits budgetClick with the Flow when a row is clicked', async () => {
    const fixture = await createComponent([groceries]);

    const row = fixture.nativeElement.querySelector('.budget-row') as HTMLElement;
    let clicked: BudgetFlow | undefined;
    fixture.componentInstance.budgetClick.subscribe((flow: BudgetFlow) => (clicked = flow));
    row.click();

    expect(clicked).toEqual(groceries);
  });

  describe('scrub-following period', () => {
    it("reflects the scrubbed month's actuals, not real wall-clock now", async () => {
      const julyTxn = matchedTxn('t1', -100, groceries.id, new Date(2026, 6, 10));
      const fixture = await createComponent([groceries], [julyTxn], new Date(2026, 6, 15));

      const fill = fixture.nativeElement.querySelector('.progress-fill') as HTMLElement;
      expect(fill.style.width).toBe('25%');
    });

    it('shows 0% for a future scrubbed month with no transactions yet', async () => {
      const julyTxn = matchedTxn('t1', -100, groceries.id, new Date(2026, 6, 10));
      const fixture = await createComponent([groceries], [julyTxn], new Date(2026, 8, 1));

      const fill = fixture.nativeElement.querySelector('.progress-fill') as HTMLElement;
      expect(fill.style.width).toBe('0%');
    });
  });

  describe('tolerance coloring', () => {
    it('has no warn class under the limit when the Budget has no Tolerance', async () => {
      const fixture = await createComponent([groceries], [matchedTxn('t1', -300, groceries.id)]);
      const row = fixture.nativeElement.querySelector('.budget-row') as HTMLElement;
      expect(row.classList.contains('warn')).toBe(false);
      expect(row.classList.contains('over')).toBe(false);
    });

    it('jumps straight to over past the limit when the Budget has no Tolerance', async () => {
      const fixture = await createComponent([groceries], [matchedTxn('t1', -500, groceries.id)]);
      const row = fixture.nativeElement.querySelector('.budget-row') as HTMLElement;
      expect(row.classList.contains('warn')).toBe(false);
      expect(row.classList.contains('over')).toBe(true);
    });

    it('is ok below the symmetric Tolerance band', async () => {
      const toleranced: BudgetFlow = { ...groceries, tolerance: { kind: 'percent', value: 10 } }; // band: 360..440
      const fixture = await createComponent([toleranced], [matchedTxn('t1', -300, toleranced.id)]);
      const row = fixture.nativeElement.querySelector('.budget-row') as HTMLElement;
      expect(row.classList.contains('warn')).toBe(false);
      expect(row.classList.contains('over')).toBe(false);
    });

    it('is warn inside the symmetric Tolerance band', async () => {
      const toleranced: BudgetFlow = { ...groceries, tolerance: { kind: 'percent', value: 10 } }; // band: 360..440
      const fixture = await createComponent([toleranced], [matchedTxn('t1', -400, toleranced.id)]);
      const row = fixture.nativeElement.querySelector('.budget-row') as HTMLElement;
      expect(row.classList.contains('warn')).toBe(true);
      expect(row.classList.contains('over')).toBe(false);
    });

    it('is over past the symmetric Tolerance band', async () => {
      const toleranced: BudgetFlow = { ...groceries, tolerance: { kind: 'percent', value: 10 } }; // band: 360..440
      const fixture = await createComponent([toleranced], [matchedTxn('t1', -500, toleranced.id)]);
      const row = fixture.nativeElement.querySelector('.budget-row') as HTMLElement;
      expect(row.classList.contains('warn')).toBe(false);
      expect(row.classList.contains('over')).toBe(true);
    });
  });

  it('sorts rows alphabetically by budget name', async () => {
    const zebra: BudgetFlow = { ...groceries, id: 'budget-2', name: 'Zebra Fund' };
    const apples: BudgetFlow = { ...groceries, id: 'budget-3', name: 'Apples' };
    const fixture = await createComponent([zebra, groceries, apples]);

    const names = Array.from(fixture.nativeElement.querySelectorAll('.name')).map(
      (el) => (el as HTMLElement).textContent,
    );
    expect(names).toEqual(['Apples', 'Groceries', 'Zebra Fund']);
  });
});
