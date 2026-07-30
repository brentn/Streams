// PROTOTYPE — throwaway, answers wayfinder ticket #59 (tributary density & zoom), part of
// map #51. Positioning logic ported unchanged from the winning tributary-visual-model
// prototype (ticket #52, variant F) — this ticket only adds decluttering behavior on top.
import { Account } from '../../../core/models/account';
import { BudgetPeriod, Flow } from '../../../core/models/flow';
import { Transfer } from '../../../core/models/transfer';
import { occurrencesInRange } from '../../../core/projection/cadence';
import { addDays, boundaryXFor, HALF_WINDOW_DAYS } from '../../../core/charting/date-window';

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

/**
 * Ticket #59 exists because real accounts don't reliably have dense-enough data to judge a
 * decluttering approach by. These synthetic entries guarantee both sub-problems the ticket
 * names are visible on every account: a same-week recurring cluster (weekly Groceries, every
 * 7 days across the whole window) and an exact same-date collision (three same-direction
 * items landing on the identical day). Additive, on top of whatever real tributaries exist.
 */
export function demoClusterItems(selectedDate: Date): PositionedTributary[] {
  const items: PositionedTributary[] = [];

  for (let offset = -HALF_WINDOW_DAYS + 3; offset <= HALF_WINDOW_DAYS; offset += 7) {
    const date = addDays(selectedDate, offset);
    items.push({
      id: `demo-groceries-${offset}`,
      kind: 'flow',
      name: 'Groceries',
      direction: 'out',
      magnitude: 55 + Math.abs(offset % 23),
      x: boundaryXFor(date, selectedDate),
      date,
    });
  }

  const collideDate = addDays(selectedDate, 12);
  const collideX = boundaryXFor(collideDate, selectedDate);
  items.push(
    {
      id: 'demo-collide-card',
      kind: 'flow',
      name: 'Card Payment',
      direction: 'out',
      magnitude: 220,
      x: collideX,
      date: collideDate,
    },
    {
      id: 'demo-collide-savings',
      kind: 'transfer',
      name: 'Savings',
      direction: 'out',
      magnitude: 150,
      x: collideX,
      date: collideDate,
    },
    {
      id: 'demo-collide-subs',
      kind: 'flow',
      name: 'Subscriptions',
      direction: 'out',
      magnitude: 45,
      x: collideX,
      date: collideDate,
    },
  );

  return items;
}

export function maxMagnitude(items: PositionedTributary[]): number {
  return items.reduce((max, item) => Math.max(max, Math.abs(item.magnitude)), 0);
}
