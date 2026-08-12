import { Dialog } from '@angular/cdk/dialog';
import { Component, computed, inject, input, output } from '@angular/core';
import { applyAssignment } from '../../../core/categorization/apply-assignment';
import { Account } from '../../../core/models/account';
import { Flow } from '../../../core/models/flow';
import { SkippedOccurrence } from '../../../core/models/skipped-occurrence';
import { Transaction } from '../../../core/models/transaction';
import { outstandingAlert } from '../../../core/projection/projection-engine';
import { StorageRepository } from '../../../core/storage/storage-repository';
import { CalendarChip } from '../../../shared/calendar-chip/calendar-chip';
import {
  ResolveOutstandingDialog,
  ResolveOutstandingDialogResult,
} from './resolve-outstanding-dialog/resolve-outstanding-dialog';

export interface OutstandingFlowTile {
  flowId: string;
  name: string;
  occurrenceDate: Date;
  amount: number;
}

/**
 * A single full-width "Outstanding Transactions" strip holding one calendar-style tile per
 * currently-Outstanding recurring-kind Flow on this Account (either direction), oldest missed
 * occurrence first — see CONTEXT.md's Outstanding entry, ADR-0012, and #95's skip-aware
 * `outstandingAlert`. Renders nothing when nothing is Outstanding, the same conditional-rendering
 * pattern as the dry-alert banner. Clicking a tile opens `ResolveOutstandingDialog` (#97) to
 * assign a matching Transaction or skip the occurrence; either resolution is persisted here
 * (mirroring `TransactionReview`/`TributaryPanel`'s own dialog-closes-with-a-result-then-caller-
 * persists split), and `changed` tells the parent to reload so the tile disappears.
 */
@Component({
  selector: 'app-outstanding-flow-row',
  imports: [CalendarChip],
  templateUrl: './outstanding-flow-row.html',
  styleUrl: './outstanding-flow-row.css',
})
export class OutstandingFlowRow {
  private readonly storage = inject(StorageRepository);
  private readonly dialog = inject(Dialog);

  readonly flows = input.required<Flow[]>();
  readonly transactions = input.required<Transaction[]>();
  readonly account = input.required<Account>();
  readonly skippedOccurrences = input.required<SkippedOccurrence[]>();
  readonly changed = output<void>();

  protected readonly tiles = computed<OutstandingFlowTile[]>(() => {
    const account = this.account();
    const transactions = this.transactions();
    const skippedOccurrences = this.skippedOccurrences();
    const today = new Date();

    return this.flows()
      .flatMap((flow) => {
        const alert = outstandingAlert(flow, transactions, account, today, skippedOccurrences);
        return alert
          ? [{ flowId: flow.id, name: flow.name, occurrenceDate: alert.occurrenceDate, amount: alert.amount }]
          : [];
      })
      .sort((a, b) => a.occurrenceDate.getTime() - b.occurrenceDate.getTime());
  });

  protected async onTileClick(tile: OutstandingFlowTile): Promise<void> {
    const flow = this.flows().find((f) => f.id === tile.flowId);
    if (!flow || flow.kind !== 'recurring') return;

    const categorizationRules = await this.storage.getCategorizationRules();
    const ref = this.dialog.open<ResolveOutstandingDialogResult>(ResolveOutstandingDialog, {
      data: {
        flow,
        occurrenceDate: tile.occurrenceDate,
        amount: tile.amount,
        transactions: this.transactions(),
        categorizationRules,
      },
    });

    ref.closed.subscribe((result) => {
      if (result) void this.applyResolution(result);
    });
  }

  private async applyResolution(result: ResolveOutstandingDialogResult): Promise<void> {
    if (result.kind === 'assign') {
      await applyAssignment(this.storage, this.transactions(), {
        mode: 'rule',
        matchText: result.matchText,
        target: result.target,
      });
    } else {
      await this.storage.upsertSkippedOccurrence({
        flowId: result.flowId,
        occurrenceDate: result.occurrenceDate,
      });
    }
    this.changed.emit();
  }
}
