// PROTOTYPE — throwaway, answers wayfinder ticket #60 (tributary legibility for tiny
// amounts / many flows), part of map #51. Positioning logic ported unchanged from the
// winning tributary-visual-model prototype (ticket #52, variant F) — this ticket only
// adds legibility behavior on top, orthogonal to #59's date-proximity decluttering.
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
 * Ticket #60 exists because real accounts don't reliably have both a large anchor amount
 * (to set the scale) and a pile of tiny, individually-dated flows (to get crowded out by it)
 * on the same account. These synthetic entries guarantee both sub-problems the ticket names,
 * deliberately spread across distinct dates (no same-week/same-date collisions — that's
 * #59's territory) so the crowding here is purely about magnitude and count, not proximity:
 * one large anchor flow that sets `maxMagnitude` high, plus a dozen sub-$10 subscriptions
 * each on their own day. Additive, on top of whatever real tributaries exist.
 */
export function demoLegibilityItems(selectedDate: Date): PositionedTributary[] {
  const items: PositionedTributary[] = [];

  const anchorDate = addDays(selectedDate, -HALF_WINDOW_DAYS + 10);
  items.push({
    id: 'demo-anchor-rent',
    kind: 'flow',
    name: 'Rent',
    direction: 'out',
    magnitude: 2200,
    x: boundaryXFor(anchorDate, selectedDate),
    date: anchorDate,
  });

  const tinyNames = [
    'Cloud Storage',
    'Music',
    'News',
    'Streaming A',
    'Streaming B',
    'Fitness App',
    'VPN',
    'Domain Renewal',
    'Podcast Club',
    'Cloud Backup',
    'Recipe App',
    'Weather Pro',
  ];
  tinyNames.forEach((name, i) => {
    // 14-day spacing keeps every item well outside #59's own proximity-clustering threshold
    // (a handful of view-units) — these lines read as individually thin, not as one cluster.
    const offset = -HALF_WINDOW_DAYS + 25 + i * 14;
    const date = addDays(selectedDate, offset);
    items.push({
      id: `demo-tiny-${i}`,
      kind: 'flow',
      name,
      direction: 'out',
      magnitude: 2 + (i % 5),
      x: boundaryXFor(date, selectedDate),
      date,
    });
  });

  return items;
}

export function maxMagnitude(items: PositionedTributary[]): number {
  return items.reduce((max, item) => Math.max(max, Math.abs(item.magnitude)), 0);
}
