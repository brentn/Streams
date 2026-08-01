import { Component, computed, input, output } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { BudgetFlow, Flow } from '../../../core/models/flow';
import { Transaction } from '../../../core/models/transaction';
import {
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

/**
 * Renders every budget-kind Flow as a name + usage-progress row, beneath the
 * uncategorized-transactions list — a budget-kind Flow has no stream presence of its own (see
 * #72, `tributaries.ts`'s `buildTributaries`), so this list is how it's reached at all.
 * Filters its own subset out of `flows`, the same "dumb inputs, filters what it needs" pattern
 * `TransactionReview` uses for `unmatched`.
 */
@Component({
  selector: 'app-budget-list',
  imports: [DecimalPipe],
  templateUrl: './budget-list.html',
  styleUrl: './budget-list.css',
})
export class BudgetList {
  readonly flows = input.required<Flow[]>();
  readonly transactions = input.required<Transaction[]>();
  /** The stream's scrub position — which Budget Period's actuals each progress bar reflects. See ADR-0011. */
  readonly selectedDate = input.required<Date>();

  readonly budgetClick = output<BudgetFlow>();

  /** Sorted alphabetically by name, independent of Budget Period or amount. */
  protected readonly rows = computed<BudgetRow[]>(() => {
    const today = this.selectedDate();
    const transactions = this.transactions();
    return this.flows()
      .filter((flow): flow is BudgetFlow => flow.kind === 'budget')
      .map((flow) => {
        const { used, limit } = budgetProgress(flow, transactions, today);
        const displayPct = limit > 0 ? (used / limit) * 100 : 0;
        return {
          flow,
          used,
          limit,
          displayPct,
          pct: Math.min(100, displayPct),
          status: budgetProgressStatus(used, limit, flow.tolerance),
        };
      })
      .sort((a, b) => a.flow.name.localeCompare(b.flow.name));
  });
}
