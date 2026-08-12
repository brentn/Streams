import { Component, computed, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';

/**
 * PROTOTYPE — throwaway. Explores how to indicate "have I over-allocated my spending budgets
 * relative to my income budgets" on the account page's Budgets summary. Not wired to real data;
 * uses fabricated sample budget-kind Flows. Switch treatments via ?variant=A|B|C in the URL.
 * See prototype/over-allocation-indicator branch.
 */

interface SampleBudget {
  name: string;
  limit: number;
  used: number;
  period: 'month' | 'year';
}

// direction: 'out' — spending caps
const OUT_BUDGETS: SampleBudget[] = [
  { name: 'Groceries', limit: 500, used: 380, period: 'month' },
  { name: 'Rent', limit: 1400, used: 1400, period: 'month' },
  { name: 'Dining Out', limit: 150, used: 210, period: 'month' },
  { name: 'Annual Insurance', limit: 1200, used: 600, period: 'year' },
];

// direction: 'in' — income targets
const IN_BUDGETS: SampleBudget[] = [
  { name: 'Salary Target', limit: 1800, used: 1800, period: 'month' },
  { name: 'Freelance Target', limit: 300, used: 120, period: 'month' },
];

function prorate(value: number, period: 'month' | 'year'): number {
  return period === 'year' ? value / 12 : value;
}

function sumLimit(budgets: SampleBudget[]): number {
  return budgets.reduce((total, b) => total + prorate(b.limit, b.period), 0);
}

function sumUsed(budgets: SampleBudget[]): number {
  return budgets.reduce((total, b) => total + prorate(b.used, b.period), 0);
}

@Component({
  selector: 'app-prototype-over-allocation',
  imports: [DecimalPipe],
  templateUrl: './prototype-over-allocation.html',
  styleUrl: './prototype-over-allocation.css',
})
export class PrototypeOverAllocation {
  readonly variant = input<string>('A');

  protected readonly totalOutLimit = sumLimit(OUT_BUDGETS);
  protected readonly totalOutUsed = sumUsed(OUT_BUDGETS);
  protected readonly totalInLimit = sumLimit(IN_BUDGETS);

  protected readonly spendDisplayPct = (this.totalOutUsed / this.totalOutLimit) * 100;
  protected readonly spendFillPct = Math.min(100, this.spendDisplayPct);
  protected readonly spendStatus =
    this.spendDisplayPct >= 100 ? 'over' : this.spendDisplayPct >= 90 ? 'warn' : 'ok';

  protected readonly isOverAllocated = this.totalOutLimit > this.totalInLimit;
  protected readonly overAllocatedBy = Math.max(0, this.totalOutLimit - this.totalInLimit);

  // Variant A: two bars sharing one scale (the larger of the two totals = 100%).
  private readonly scaleA = Math.max(this.totalInLimit, this.totalOutLimit);
  protected readonly incomeWidthA = (this.totalInLimit / this.scaleA) * 100;
  protected readonly spendWidthA = Math.min(100, (this.totalOutLimit / this.scaleA) * 100);
  protected readonly spendWithinIncomeWidthA = Math.min(
    this.spendWidthA,
    this.incomeWidthA,
  );
  protected readonly spendOverflowWidthA = this.spendWidthA - this.spendWithinIncomeWidthA;

  // Variant C: a marker on the spending bar's own scale (100% = total spending allocation)
  // showing where the income target falls. If income < allocation, the marker sits before the
  // end; the segment past the marker is the over-allocated portion.
  protected readonly incomeMarkerPctC = Math.min(
    100,
    (this.totalInLimit / this.totalOutLimit) * 100,
  );

  protected readonly outBudgets = OUT_BUDGETS;
  protected readonly inBudgets = IN_BUDGETS;
}
