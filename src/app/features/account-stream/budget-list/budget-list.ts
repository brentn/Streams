import { Component, computed, input, output } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { BudgetFlow, Flow } from '../../../core/models/flow';
import { Transaction } from '../../../core/models/transaction';
import {
  aggregateBudgetProgress,
  averageMonthlyIncome,
  BudgetProgressStatus,
  budgetProgress,
  budgetProgressStatus,
} from '../../../core/projection/projection-engine';

export interface BudgetRow {
  flow: BudgetFlow;
  used: number;
  limit: number;
  /** True, uncapped usage percentage — the text shown on the row. */
  displayPct: number;
  /** Fill width percentage, capped at 100 so an over-limit Budget's bar doesn't overflow its track. */
  pct: number;
  status: BudgetProgressStatus;
}

/** Trailing window `averageMonthlyIncome` looks back over — fixed, not user-configurable (#103). */
const INCOME_WINDOW_MONTHS = 3;

/** Aggregate fill-percentage thresholds for the summary bar's color — a flat band on the combined ratio, deliberately not derived from any per-budget Tolerance (#103). */
const WARN_AT_PCT = 90;

/** True (uncapped) and fill (capped at 100) usage percentages — shared by the per-row and summary progress bars. */
function progressPct(used: number, limit: number): { displayPct: number; pct: number } {
  const displayPct = limit > 0 ? (used / limit) * 100 : 0;
  return { displayPct, pct: Math.min(100, displayPct) };
}

export interface BudgetSummary {
  used: number;
  limit: number;
  /** True, uncapped usage percentage across every out-direction budget-kind Flow. */
  displayPct: number;
  /** Fill width percentage, capped at 100. */
  pct: number;
  status: BudgetProgressStatus;
  /** Actual average monthly income over the trailing window, scoped to this account. */
  avgIncome: number;
  /** `|limit - avgIncome|` — the dollar gap the "over"/"under" text reports. */
  overUnderAmount: number;
  /** True when the total spending allocation (`limit`) exceeds `avgIncome`. */
  overIncome: boolean;
}

/**
 * Renders every budget-kind Flow as a name + usage-progress row, beneath the
 * uncategorized-transactions list — a budget-kind Flow has no stream presence of its own (see
 * #72, `tributaries.ts`'s `buildTributaries`), so this list is how it's reached at all.
 * Filters its own subset out of `flows`, the same "dumb inputs, filters what it needs" pattern
 * `TransactionReview` uses for `unmatched`. Above the rows, a summary block folds every
 * out-direction budget-kind Flow into one combined total/progress-bar and compares it against
 * actual average income (#103) — `direction: 'in'` budgets are left out of that total but still
 * render as their own row below, unchanged. Unlike the uncategorized-transactions list above it,
 * this list has no scroll cap — every row renders, however many there are (#103, supersedes part
 * of ADR-0010; see ADR-0017).
 */
@Component({
  selector: 'app-budget-list',
  imports: [CurrencyPipe, DecimalPipe],
  templateUrl: './budget-list.html',
  styleUrl: './budget-list.css',
})
export class BudgetList {
  readonly flows = input.required<Flow[]>();
  readonly transactions = input.required<Transaction[]>();
  /** The stream's scrub position — which Budget Period's actuals each progress bar reflects. See ADR-0011. */
  readonly selectedDate = input.required<Date>();

  readonly budgetClick = output<BudgetFlow>();

  /**
   * The combined spending-budget picture above the per-row list: total used/allocated across
   * every `direction: 'out'` budget-kind Flow, and how that allocation compares to actual
   * average income (#103). A thin wrapper over `aggregateBudgetProgress`/`averageMonthlyIncome`
   * — it renders their output rather than re-deriving any of the math itself.
   */
  protected readonly summary = computed<BudgetSummary>(() => {
    const today = this.selectedDate();
    const transactions = this.transactions();
    const { used, limit } = aggregateBudgetProgress(this.flows(), transactions, today);
    const { displayPct, pct } = progressPct(used, limit);
    const avgIncome = averageMonthlyIncome(transactions, today, INCOME_WINDOW_MONTHS);
    const overIncome = limit > avgIncome;
    const status: BudgetProgressStatus =
      limit <= 0
        ? used > 0
          ? 'over'
          : 'ok'
        : displayPct > 100
          ? 'over'
          : displayPct >= WARN_AT_PCT
            ? 'warn'
            : 'ok';
    return {
      used,
      limit,
      displayPct,
      pct,
      status,
      avgIncome,
      overUnderAmount: Math.abs(limit - avgIncome),
      overIncome,
    };
  });

  /** Sorted alphabetically by name, independent of Budget Period or amount. */
  protected readonly rows = computed<BudgetRow[]>(() => {
    const today = this.selectedDate();
    const transactions = this.transactions();
    return this.flows()
      .filter((flow): flow is BudgetFlow => flow.kind === 'budget')
      .map((flow) => {
        const { used, limit } = budgetProgress(flow, transactions, today);
        const { displayPct, pct } = progressPct(used, limit);
        return {
          flow,
          used,
          limit,
          displayPct,
          pct,
          status: budgetProgressStatus(used, limit, flow.tolerance),
        };
      })
      .sort((a, b) => a.flow.name.localeCompare(b.flow.name));
  });
}
