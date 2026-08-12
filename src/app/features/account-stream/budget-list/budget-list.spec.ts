import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { BudgetFlow, Flow, RecurringFlow } from '../../../core/models/flow';
import { IgnoredTransaction } from '../../../core/models/ignored-transaction';
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

const incomeBudget: BudgetFlow = {
  id: 'budget-income',
  accountId: 'acc-1',
  name: 'Salary Target',
  direction: 'in',
  kind: 'budget',
  limit: 2000,
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

function unmatchedTxn(id: string, amount: number, date: Date): Transaction {
  return {
    id,
    accountId: 'acc-1',
    date,
    amount,
    description: `txn-${id}`,
    matchedTarget: null,
  };
}

describe('BudgetList', () => {
  async function createComponent(
    flows: Flow[] = [],
    transactions: Transaction[] = [],
    selectedDate: Date = new Date(),
    ignoredTransactions: IgnoredTransaction[] = [],
  ) {
    await TestBed.configureTestingModule({ imports: [BudgetList] }).compileComponents();
    const fixture = TestBed.createComponent(BudgetList);
    fixture.componentRef.setInput('flows', flows);
    fixture.componentRef.setInput('transactions', transactions);
    fixture.componentRef.setInput('selectedDate', selectedDate);
    fixture.componentRef.setInput('ignoredTransactions', ignoredTransactions);
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

  it('excludes an Ignored Transaction from a row\'s used amount (ADR-0019)', async () => {
    const fixture = await createComponent(
      [groceries],
      [matchedTxn('t1', -100, groceries.id)],
      new Date(),
      [{ transactionId: 't1' }],
    );

    const fill = fixture.nativeElement.querySelector('.progress-fill') as HTMLElement;
    expect(fill.style.width).toBe('0%');
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

  describe('summary (#103)', () => {
    const scrubDate = new Date(2026, 6, 15);
    // Well before the trailing 3-month income window, so the window is fully spanned (avg = sum / 3).
    const oldHistoryTxn = unmatchedTxn('old-history', -10, new Date(2025, 0, 1));

    function incomeTxn(id: string, amount: number): Transaction {
      return unmatchedTxn(id, amount, new Date(2026, 6, 10));
    }

    it('totals used/allocated across out-direction budgets only, excluding in-direction budgets', async () => {
      const fixture = await createComponent(
        [groceries, incomeBudget],
        [
          matchedTxn('t1', -300, groceries.id, new Date(2026, 6, 10)),
          matchedTxn('t2', 500, incomeBudget.id, new Date(2026, 6, 10)),
        ],
        scrubDate,
      );
      const amounts = fixture.nativeElement.querySelector('.amounts') as HTMLElement;
      expect(amounts.textContent).toContain('$300');
      expect(amounts.textContent).toContain('$400');
    });

    it("prorates a year-period budget's contribution to the aggregate total by 1/12", async () => {
      const insurance: BudgetFlow = { ...groceries, id: 'budget-insurance', period: 'year', limit: 1200 };
      const fixture = await createComponent(
        [insurance],
        [matchedTxn('t1', -600, insurance.id, new Date(2026, 6, 10))],
        scrubDate,
      );
      const amounts = fixture.nativeElement.querySelector('.amounts') as HTMLElement;
      expect(amounts.textContent).toContain('$50');
      expect(amounts.textContent).toContain('$100');
    });

    it('sizes the summary bar fill by the aggregate used/limit ratio', async () => {
      const fixture = await createComponent(
        [groceries],
        [matchedTxn('t1', -300, groceries.id, new Date(2026, 6, 10))],
        scrubDate,
      );
      const fill = fixture.nativeElement.querySelector('.summary-bar .progress-fill') as HTMLElement;
      expect(fill.style.width).toBe('75%');
    });

    it('caps the summary bar fill at 100% while the amounts text stays uncapped', async () => {
      const fixture = await createComponent(
        [groceries],
        [matchedTxn('t1', -600, groceries.id, new Date(2026, 6, 10))],
        scrubDate,
      );
      const fill = fixture.nativeElement.querySelector('.summary-bar .progress-fill') as HTMLElement;
      expect(fill.style.width).toBe('100%');
      const amounts = fixture.nativeElement.querySelector('.amounts') as HTMLElement;
      expect(amounts.textContent).toContain('$600');
      expect(amounts.textContent).toContain('$400');
    });

    it('is ok below 90% of the aggregate allocation', async () => {
      const fixture = await createComponent(
        [groceries],
        [matchedTxn('t1', -300, groceries.id, new Date(2026, 6, 10))], // 75%
        scrubDate,
      );
      const bar = fixture.nativeElement.querySelector('.summary-bar') as HTMLElement;
      expect(bar.classList.contains('warn')).toBe(false);
      expect(bar.classList.contains('over')).toBe(false);
    });

    it('is warn from 90% up to 100% of the aggregate allocation', async () => {
      const fixture = await createComponent(
        [groceries],
        [matchedTxn('t1', -360, groceries.id, new Date(2026, 6, 10))], // exactly 90%
        scrubDate,
      );
      const bar = fixture.nativeElement.querySelector('.summary-bar') as HTMLElement;
      expect(bar.classList.contains('warn')).toBe(true);
      expect(bar.classList.contains('over')).toBe(false);
    });

    it('is over past 100% of the aggregate allocation', async () => {
      const fixture = await createComponent(
        [groceries],
        [matchedTxn('t1', -401, groceries.id, new Date(2026, 6, 10))], // just past 100%
        scrubDate,
      );
      const bar = fixture.nativeElement.querySelector('.summary-bar') as HTMLElement;
      expect(bar.classList.contains('warn')).toBe(false);
      expect(bar.classList.contains('over')).toBe(true);
    });

    it('shows average monthly income and flags the total allocation as over when it exceeds income', async () => {
      const fixture = await createComponent(
        [groceries],
        [matchedTxn('t1', -300, groceries.id, new Date(2026, 6, 10)), oldHistoryTxn, incomeTxn('i1', 900)], // avg income = 300, limit = 400
        scrubDate,
      );
      const incomeLine = fixture.nativeElement.querySelector('.income-line') as HTMLElement;
      expect(incomeLine.classList.contains('over')).toBe(true);
      expect(incomeLine.textContent).toContain('$300');
      expect(incomeLine.textContent).toContain('$100');
      expect(incomeLine.textContent).toContain('over');
    });

    it('flags the total allocation as under when it does not exceed average income', async () => {
      const fixture = await createComponent(
        [groceries],
        [matchedTxn('t1', -300, groceries.id, new Date(2026, 6, 10)), oldHistoryTxn, incomeTxn('i1', 1500)], // avg income = 500, limit = 400
        scrubDate,
      );
      const incomeLine = fixture.nativeElement.querySelector('.income-line') as HTMLElement;
      expect(incomeLine.classList.contains('over')).toBe(false);
      expect(incomeLine.textContent).toContain('$500');
      expect(incomeLine.textContent).toContain('$100');
      expect(incomeLine.textContent).toContain('under');
    });

    it('renders neutral, not critical, when the total allocation exactly equals average income', async () => {
      const fixture = await createComponent(
        [groceries],
        [matchedTxn('t1', -300, groceries.id, new Date(2026, 6, 10)), oldHistoryTxn, incomeTxn('i1', 1200)], // avg income = 400, limit = 400
        scrubDate,
      );
      const incomeLine = fixture.nativeElement.querySelector('.income-line') as HTMLElement;
      expect(incomeLine.classList.contains('over')).toBe(false);
      expect(incomeLine.textContent).toContain('under');
    });

    it('excludes an Ignored Transaction from both the spending total and the average income (ADR-0019)', async () => {
      const fixture = await createComponent(
        [groceries],
        [
          matchedTxn('t1', -300, groceries.id, new Date(2026, 6, 10)),
          oldHistoryTxn,
          incomeTxn('i1', 900),
        ],
        scrubDate,
        [{ transactionId: 't1' }, { transactionId: 'i1' }],
      );
      const amounts = fixture.nativeElement.querySelector('.amounts') as HTMLElement;
      expect(amounts.textContent).toContain('$0');
      const incomeLine = fixture.nativeElement.querySelector('.income-line') as HTMLElement;
      expect(incomeLine.textContent).toContain('$0');
    });

    it('is over when the aggregate allocation is zero but usage is positive', async () => {
      const zeroLimit: BudgetFlow = { ...groceries, limit: 0 };
      const fixture = await createComponent(
        [zeroLimit],
        [matchedTxn('t1', -50, zeroLimit.id, new Date(2026, 6, 10))],
        scrubDate,
      );
      const bar = fixture.nativeElement.querySelector('.summary-bar') as HTMLElement;
      expect(bar.classList.contains('over')).toBe(true);
    });
  });
});
