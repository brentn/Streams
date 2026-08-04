import { Account } from '../models/account';
import { AmountChange, BudgetFlow, BudgetPeriod, Flow, FlowDirection, RecurringFlow } from '../models/flow';
import { Transaction } from '../models/transaction';
import { Transfer } from '../models/transfer';
import { amountAtDate } from '../projection/amount-timeline';
import { occurrencesInRange } from '../projection/cadence';
import { OutstandingAlert, outstandingAlert } from '../projection/projection-engine';
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
  /** The source Flow's id, set only when `kind === 'flow'` — lets a click handler resolve the Flow directly, without parsing `id`. */
  flowId?: string;
  /** The source Transfer's id, set only when `kind === 'transfer'`. */
  transferId?: string;
  /** Set on an Outstanding Flow's same-day "Pending" stand-in (see `withOutstandingTributaries`, #88/#91) — renders with a distinct warning treatment instead of the normal one. The Flow's own past-dated occurrence is excluded from rendering entirely rather than flagged, so this never appears on a real occurrence's Tributary. */
  warning?: boolean;
}

/** The `(startExclusive, endInclusive]` bounds of the `selectedDate`-centered window (see `buildWindowDates`) that every Tributary builder filters occurrences/Transactions into. */
function windowBounds(selectedDate: Date): { startExclusive: Date; endInclusive: Date } {
  const windowDates = buildWindowDates(selectedDate);
  return {
    startExclusive: addDays(windowDates[0], -1),
    endInclusive: windowDates[windowDates.length - 1],
  };
}

/** Whether `date` falls in a `windowBounds`-shaped `(startExclusive, endInclusive]` range. */
function isInWindow(date: Date, bounds: { startExclusive: Date; endInclusive: Date }): boolean {
  return date.getTime() > bounds.startExclusive.getTime() && date.getTime() <= bounds.endInclusive.getTime();
}

function periodStart(period: BudgetPeriod, date: Date): Date {
  return period === 'month'
    ? new Date(date.getFullYear(), date.getMonth(), 1)
    : new Date(date.getFullYear(), 0, 1);
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
  sourceId?: string,
): Tributary[] {
  const sourceIdField: Pick<Tributary, 'flowId' | 'transferId'> =
    kind === 'flow' ? { flowId: sourceId } : kind === 'transfer' ? { transferId: sourceId } : {};

  return dates.map((date) => ({
    id: `${idPrefix}-${date.getTime()}`,
    kind,
    direction,
    date,
    x: boundaryXFor(date, selectedDate),
    amount: Math.abs(amountAtDate(initialAmount, changes, date)),
    label,
    ...sourceIdField,
  }));
}

/** A budget-kind Flow has no occurrence timeline — see `budgetDrillInTributary` for how it's reached instead (#72). */
function flowTributaries(
  flow: RecurringFlow,
  startExclusive: Date,
  endInclusive: Date,
  selectedDate: Date,
): Tributary[] {
  const dates = occurrencesInRange(flow.cadence, startExclusive, endInclusive);

  return makeTributaries(
    `flow-${flow.id}`,
    'flow',
    flow.direction,
    flow.name,
    dates,
    flow.amount,
    flow.amountChanges ?? [],
    selectedDate,
    flow.id,
  );
}

/**
 * A synthetic, single Tributary standing in for a budget-kind Flow's list row, so the Budgets
 * list (see #72) can open the same drill-in panel a real Tributary click does without giving
 * the budget an actual stream position — the panel only reads `kind`/`flowId` off its input.
 */
export function budgetDrillInTributary(flow: BudgetFlow, selectedDate: Date): Tributary {
  return {
    id: `flow-${flow.id}-budget-row`,
    kind: 'flow',
    direction: flow.direction,
    date: selectedDate,
    x: 0,
    amount: flow.limit,
    label: flow.name,
    flowId: flow.id,
  };
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
    transfer.id,
  );
}

/**
 * One Tributary per real recurring-kind Flow occurrence, plus one per Transfer occurrence,
 * visible in the `selectedDate`-centered window (see `buildWindowDates`) — not one aggregate
 * per Flow. A budget-kind Flow renders none: its limit applies across a whole Budget Period
 * rather than at one point in time, so it's reached via the Budgets list instead (see #72,
 * `budgetDrillInTributary`). `accountId` disambiguates a Transfer's direction and other-account
 * label, since the same Transfer renders on both of its Accounts' screens.
 */
export function buildTributaries(
  flows: Flow[],
  transfers: Transfer[],
  accounts: Account[],
  accountId: string,
  selectedDate: Date,
): Tributary[] {
  const { startExclusive, endInclusive } = windowBounds(selectedDate);

  const flowTribs = flows
    .filter((flow): flow is RecurringFlow => flow.kind === 'recurring')
    .flatMap((flow) => flowTributaries(flow, startExclusive, endInclusive, selectedDate));
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
  const bounds = windowBounds(selectedDate);

  const buckets = new Map<string, { direction: FlowDirection; date: Date; total: number }>();

  for (const t of transactions) {
    if (t.matchedTarget !== null) continue;

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
    .filter((b) => isInWindow(b.date, bounds))
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

/**
 * Layers Outstanding-Flow rendering (#88, #91, ADR-0012) onto `tributaries` (as built by
 * `buildTributaries`): the missed occurrence's own real Tributary is excluded entirely — never
 * rendered alongside the stand-in, even when its past date is otherwise in view, so the same
 * missed payment never shows twice — and a synthetic same-day stand-in, labeled "Pending:
 * `<name>`", carrying the real Flow's own `flowId` (so clicking it opens the same `TributaryPanel`
 * a real occurrence would) and flagged `warning: true`, is appended at today's position. The
 * exclusion runs regardless of whether today is in the visible window; the stand-in itself is
 * omitted when today falls outside the `selectedDate`-centered visible window, same as any other
 * Tributary would be. Both resolve themselves automatically on the next render once
 * `outstandingAlert` clears (including via its 14-day grace period expiring) — no manual dismissal
 * needed.
 */
export function withOutstandingTributaries(
  tributaries: Tributary[],
  flows: Flow[],
  transactions: Transaction[],
  account: Pick<Account, 'balanceDate'>,
  today: Date,
  selectedDate: Date,
): Tributary[] {
  const alertsByFlowId = new Map<string, { flow: RecurringFlow; alert: OutstandingAlert }>();
  for (const flow of flows) {
    if (flow.kind !== 'recurring') continue;
    const alert = outstandingAlert(flow, transactions, account, today);
    if (alert) alertsByFlowId.set(flow.id, { flow, alert });
  }
  if (alertsByFlowId.size === 0) return tributaries;

  const filtered = tributaries.filter((t) => {
    const entry = t.flowId ? alertsByFlowId.get(t.flowId) : undefined;
    return !entry || t.date.getTime() !== entry.alert.occurrenceDate.getTime();
  });

  if (!isInWindow(today, windowBounds(selectedDate))) return filtered;

  const standIns: Tributary[] = Array.from(alertsByFlowId.entries()).map(([flowId, { flow, alert }]) => ({
    id: `flow-${flowId}-outstanding-pending`,
    kind: 'flow',
    direction: flow.direction,
    date: today,
    x: boundaryXFor(today, selectedDate),
    amount: alert.amount,
    label: `Pending: ${flow.name}`,
    flowId,
    warning: true,
  }));

  return [...filtered, ...standIns];
}
