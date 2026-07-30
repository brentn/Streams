// PROTOTYPE — throwaway, answers wayfinder ticket #52 (tributary visual model).
import { Account } from '../../../core/models/account';
import { BudgetPeriod, Flow } from '../../../core/models/flow';
import { Transfer } from '../../../core/models/transfer';
import { occurrencesInRange } from '../../../core/projection/cadence';
import { addDays, boundaryXFor, HALF_WINDOW_DAYS } from '../../../core/charting/date-window';

export interface TributaryItem {
  id: string;
  kind: 'flow' | 'transfer';
  name: string;
  direction: 'in' | 'out';
  /** Recurring flow's periodic amount, budget flow's limit, or transfer amount — the magnitude a tributary is sized from. */
  magnitude: number;
}

/**
 * Shapes this Account's Flows and Transfers into one sizeable, named list —
 * shared by every prototype variant so they only disagree on layout.
 * Transfer direction/name resolve against the other Account involved.
 */
export function buildTributaries(
  flows: Flow[],
  transfers: Transfer[],
  accountId: string,
  accounts: Account[],
): TributaryItem[] {
  const flowItems: TributaryItem[] = flows.map((flow) => ({
    id: flow.id,
    kind: 'flow',
    name: flow.name || '(unnamed)',
    direction: flow.direction,
    magnitude: flow.kind === 'recurring' ? flow.amount : flow.limit,
  }));

  const transferItems: TributaryItem[] = transfers.map((transfer) => {
    const isOutgoing = transfer.fromAccountId === accountId;
    const otherId = isOutgoing ? transfer.toAccountId : transfer.fromAccountId;
    const otherName = accounts.find((a) => a.id === otherId)?.name ?? 'Unknown account';
    return {
      id: transfer.id,
      kind: 'transfer',
      name: otherName,
      direction: isOutgoing ? 'out' : 'in',
      magnitude: transfer.amount,
    };
  });

  return [...flowItems, ...transferItems];
}

export function maxMagnitude(items: TributaryItem[]): number {
  return items.reduce((max, item) => Math.max(max, Math.abs(item.magnitude)), 0);
}

export interface PositionedTributary {
  id: string;
  kind: 'flow' | 'transfer';
  name: string;
  direction: 'in' | 'out';
  magnitude: number;
  /** Day-index within the visible window — same coordinate space as StreamBand's `points`. */
  x: number;
  date: Date;
}

/** A budget-kind Flow has no cadence, only a renewal period — its "occurrence" is each period's start. */
function budgetPeriodStarts(period: BudgetPeriod, startExclusive: Date, endInclusive: Date): Date[] {
  const results: Date[] = [];
  let cursor =
    period === 'month'
      ? new Date(startExclusive.getFullYear(), startExclusive.getMonth(), 1)
      : new Date(startExclusive.getFullYear(), 0, 1);
  while (cursor.getTime() <= endInclusive.getTime()) {
    if (cursor.getTime() > startExclusive.getTime()) results.push(cursor);
    cursor =
      period === 'month'
        ? new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
        : new Date(cursor.getFullYear() + 1, 0, 1);
  }
  return results;
}

/**
 * Each Flow/Transfer occurrence within the visible window, positioned at its real date —
 * a recurring Flow or Transfer can surface more than once (e.g. a weekly grocery Flow),
 * each a separate tributary joining the band on that specific day.
 */
export function buildPositionedTributaries(
  flows: Flow[],
  transfers: Transfer[],
  accountId: string,
  accounts: Account[],
  selectedDate: Date,
): PositionedTributary[] {
  const start = addDays(selectedDate, -HALF_WINDOW_DAYS - 1);
  const end = addDays(selectedDate, HALF_WINDOW_DAYS);
  const items: PositionedTributary[] = [];

  for (const flow of flows) {
    const dates =
      flow.kind === 'recurring'
        ? occurrencesInRange(flow.cadence, start, end)
        : budgetPeriodStarts(flow.period, start, end);
    const magnitude = flow.kind === 'recurring' ? flow.amount : flow.limit;
    for (const date of dates) {
      items.push({
        id: `${flow.id}-${date.getTime()}`,
        kind: 'flow',
        name: flow.name || '(unnamed)',
        direction: flow.direction,
        magnitude,
        x: boundaryXFor(date, selectedDate),
        date,
      });
    }
  }

  for (const transfer of transfers) {
    const isOutgoing = transfer.fromAccountId === accountId;
    const otherId = isOutgoing ? transfer.toAccountId : transfer.fromAccountId;
    const otherName = accounts.find((a) => a.id === otherId)?.name ?? 'Unknown account';
    for (const date of occurrencesInRange(transfer.cadence, start, end)) {
      items.push({
        id: `${transfer.id}-${date.getTime()}`,
        kind: 'transfer',
        name: otherName,
        direction: isOutgoing ? 'out' : 'in',
        magnitude: transfer.amount,
        x: boundaryXFor(date, selectedDate),
        date,
      });
    }
  }

  return items;
}
