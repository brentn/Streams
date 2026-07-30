import { Account } from '../models/account';
import { AmountChange, BudgetPeriod, Flow, FlowDirection } from '../models/flow';
import { Transaction } from '../models/transaction';
import { Transfer } from '../models/transfer';
import { amountAtDate } from '../projection/amount-timeline';
import { occurrencesInRange } from '../projection/cadence';
import { addDays, boundaryXFor, buildWindowDates } from './date-window';

/** One real Flow/Transfer occurrence, or one unmatched Transaction, to render as a tributary joining/leaving the balance river. */
export interface Tributary {
  id: string;
  kind: 'flow' | 'transfer' | 'uncategorized';
  direction: FlowDirection;
  date: Date;
  x: number;
  amount: number;
  label: string;
}

/** The `(startExclusive, endInclusive]` bounds of the `selectedDate`-centered window (see `buildWindowDates`) that every Tributary builder filters occurrences/Transactions into. */
function windowBounds(selectedDate: Date): { startExclusive: Date; endInclusive: Date } {
  const windowDates = buildWindowDates(selectedDate);
  return {
    startExclusive: addDays(windowDates[0], -1),
    endInclusive: windowDates[windowDates.length - 1],
  };
}

function periodStart(period: BudgetPeriod, date: Date): Date {
  return period === 'month'
    ? new Date(date.getFullYear(), date.getMonth(), 1)
    : new Date(date.getFullYear(), 0, 1);
}

function nextPeriodStart(period: BudgetPeriod, start: Date): Date {
  return period === 'month'
    ? new Date(start.getFullYear(), start.getMonth() + 1, 1)
    : new Date(start.getFullYear() + 1, 0, 1);
}

/** A budget-kind Flow has no Cadence, so its "occurrences" are synthesized at each renewal period's start. */
function budgetPeriodStarts(period: BudgetPeriod, startExclusive: Date, endInclusive: Date): Date[] {
  const results: Date[] = [];
  let cursor = periodStart(period, startExclusive);
  while (cursor.getTime() <= endInclusive.getTime()) {
    if (cursor.getTime() > startExclusive.getTime()) {
      results.push(cursor);
    }
    cursor = nextPeriodStart(period, cursor);
  }
  return results;
}

/** One Tributary per `date`, sharing everything but the amount at that date and its x-position. */
function makeTributaries(
  idPrefix: string,
  kind: Tributary['kind'],
  direction: FlowDirection,
  label: string,
  dates: Date[],
  initialAmount: number,
  changes: AmountChange[],
  selectedDate: Date,
): Tributary[] {
  return dates.map((date) => ({
    id: `${idPrefix}-${date.getTime()}`,
    kind,
    direction,
    date,
    x: boundaryXFor(date, selectedDate),
    amount: Math.abs(amountAtDate(initialAmount, changes, date)),
    label,
  }));
}

function flowTributaries(
  flow: Flow,
  startExclusive: Date,
  endInclusive: Date,
  selectedDate: Date,
): Tributary[] {
  const dates =
    flow.kind === 'recurring'
      ? occurrencesInRange(flow.cadence, startExclusive, endInclusive)
      : budgetPeriodStarts(flow.period, startExclusive, endInclusive);
  const initialAmount = flow.kind === 'recurring' ? flow.amount : flow.limit;

  return makeTributaries(
    `flow-${flow.id}`,
    'flow',
    flow.direction,
    flow.name,
    dates,
    initialAmount,
    flow.amountChanges ?? [],
    selectedDate,
  );
}

/** `→ Other Account` when money leaves toward it, `← Other Account` when it arrives from it. */
function transferLabel(transfer: Transfer, accountId: string, accounts: Account[]): {
  direction: FlowDirection;
  label: string;
} {
  const isOutgoing = transfer.fromAccountId === accountId;
  const otherAccountId = isOutgoing ? transfer.toAccountId : transfer.fromAccountId;
  const otherName = accounts.find((a) => a.id === otherAccountId)?.name ?? 'Unknown';
  return {
    direction: isOutgoing ? 'out' : 'in',
    label: `${isOutgoing ? '→' : '←'} ${otherName}`,
  };
}

function transferTributaries(
  transfer: Transfer,
  accountId: string,
  accounts: Account[],
  startExclusive: Date,
  endInclusive: Date,
  selectedDate: Date,
): Tributary[] {
  const { direction, label } = transferLabel(transfer, accountId, accounts);
  const dates = occurrencesInRange(transfer.cadence, startExclusive, endInclusive);

  return makeTributaries(
    `transfer-${transfer.id}`,
    'transfer',
    direction,
    label,
    dates,
    transfer.amount,
    transfer.amountChanges ?? [],
    selectedDate,
  );
}

/**
 * One Tributary per real Flow/Transfer occurrence visible in the `selectedDate`-centered
 * window (see `buildWindowDates`) — not one aggregate per Flow. `accountId` disambiguates a
 * Transfer's direction and other-account label, since the same Transfer renders on both of
 * its Accounts' screens.
 */
export function buildTributaries(
  flows: Flow[],
  transfers: Transfer[],
  accounts: Account[],
  accountId: string,
  selectedDate: Date,
): Tributary[] {
  const { startExclusive, endInclusive } = windowBounds(selectedDate);

  const flowTribs = flows.flatMap((flow) => flowTributaries(flow, startExclusive, endInclusive, selectedDate));
  const transferTribs = transfers.flatMap((transfer) =>
    transferTributaries(transfer, accountId, accounts, startExclusive, endInclusive, selectedDate),
  );

  return [...flowTribs, ...transferTribs];
}

/**
 * One Tributary per `(direction, calendar month)` bucket of unmatched Transactions visible in
 * the `selectedDate`-centered window — a rendering-only aggregation, not a real Flow/Transfer
 * (see ADR-0007). Direction follows each Transaction's own signed amount, the same convention
 * `signedFlowAmount` uses for a Flow: positive is `in`, negative is `out`. A bucket is positioned
 * on the 1st of its month and sized by the summed absolute amount of its Transactions; a
 * `(direction, month)` combination with no unmatched Transactions renders nothing.
 */
export function buildUncategorizedTributaries(
  transactions: Transaction[],
  selectedDate: Date,
): Tributary[] {
  const { startExclusive, endInclusive } = windowBounds(selectedDate);

  const buckets = new Map<string, { direction: FlowDirection; date: Date; total: number }>();

  for (const t of transactions) {
    if (t.matchedFlowId !== null) continue;

    const direction: FlowDirection = t.amount >= 0 ? 'in' : 'out';
    const monthStart = periodStart('month', t.date);
    const key = `${direction}-${monthStart.getTime()}`;

    const existing = buckets.get(key);
    if (existing) {
      existing.total += Math.abs(t.amount);
    } else {
      buckets.set(key, { direction, date: monthStart, total: Math.abs(t.amount) });
    }
  }

  return Array.from(buckets.values())
    .filter((b) => b.date.getTime() > startExclusive.getTime() && b.date.getTime() <= endInclusive.getTime())
    .map((b) => ({
      id: `uncategorized-${b.direction}-${b.date.getTime()}`,
      kind: 'uncategorized',
      direction: b.direction,
      date: b.date,
      x: boundaryXFor(b.date, selectedDate),
      amount: b.total,
      label: 'Uncategorized',
    }));
}
