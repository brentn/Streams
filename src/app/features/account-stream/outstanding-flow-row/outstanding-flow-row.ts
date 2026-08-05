import { Component, computed, input } from '@angular/core';
import { Account } from '../../../core/models/account';
import { Flow } from '../../../core/models/flow';
import { SkippedOccurrence } from '../../../core/models/skipped-occurrence';
import { Transaction } from '../../../core/models/transaction';
import { outstandingAlert } from '../../../core/projection/projection-engine';
import { CalendarChip } from '../../../shared/calendar-chip/calendar-chip';

export interface OutstandingFlowTile {
  flowId: string;
  name: string;
  occurrenceDate: Date;
}

/**
 * One calendar-style tile per currently-Outstanding recurring-kind Flow on this Account (either
 * direction), oldest missed occurrence first — see CONTEXT.md's Outstanding entry, ADR-0012, and
 * #95's skip-aware `outstandingAlert`. Not yet clickable (#97 wires up an action); renders
 * nothing when nothing is Outstanding, the same conditional-rendering pattern as the dry-alert
 * banner.
 */
@Component({
  selector: 'app-outstanding-flow-row',
  imports: [CalendarChip],
  templateUrl: './outstanding-flow-row.html',
  styleUrl: './outstanding-flow-row.css',
})
export class OutstandingFlowRow {
  readonly flows = input.required<Flow[]>();
  readonly transactions = input.required<Transaction[]>();
  readonly account = input.required<Account>();
  readonly skippedOccurrences = input.required<SkippedOccurrence[]>();

  protected readonly tiles = computed<OutstandingFlowTile[]>(() => {
    const account = this.account();
    const transactions = this.transactions();
    const skippedOccurrences = this.skippedOccurrences();
    const today = new Date();

    return this.flows()
      .flatMap((flow) => {
        const alert = outstandingAlert(flow, transactions, account, today, skippedOccurrences);
        return alert ? [{ flowId: flow.id, name: flow.name, occurrenceDate: alert.occurrenceDate }] : [];
      })
      .sort((a, b) => a.occurrenceDate.getTime() - b.occurrenceDate.getTime());
  });
}
