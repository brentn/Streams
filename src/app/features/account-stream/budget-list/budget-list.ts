import { Component, computed, input, output } from '@angular/core';
import { BudgetFlow, Flow } from '../../../core/models/flow';
import { Transaction } from '../../../core/models/transaction';
import { budgetProgress } from '../../../core/projection/projection-engine';

export interface BudgetRow {
  flow: BudgetFlow;
  used: number;
  limit: number;
  pct: number;
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
  templateUrl: './budget-list.html',
  styleUrl: './budget-list.css',
})
export class BudgetList {
  readonly flows = input.required<Flow[]>();
  readonly transactions = input.required<Transaction[]>();

  readonly budgetClick = output<BudgetFlow>();

  /**
   * Real wall-clock "now", not the page's scrubbable `selectedDate` — a Budget Period is a
   * real-calendar concept independent of the stream's scrub position, the same convention
   * `TransactionReview`'s unwindowed uncategorized list and `account-stream.ts`'s `dryAlert`
   * (`runningDryAlert(..., new Date())`) already use for "current state" that sits beside,
   * rather than inside, the scrubbable stream visualization.
   */
  protected readonly rows = computed<BudgetRow[]>(() => {
    const today = new Date();
    const transactions = this.transactions();
    return this.flows()
      .filter((flow): flow is BudgetFlow => flow.kind === 'budget')
      .map((flow) => {
        const { used, limit } = budgetProgress(flow, transactions, today);
        return { flow, used, limit, pct: limit > 0 ? Math.min(100, (used / limit) * 100) : 0 };
      });
  });
}
