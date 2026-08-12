import { Account } from '../models/account';
import {
  AmountChange,
  BudgetFlow,
  Cadence,
  Flow,
  RecurringFlow,
  Tolerance,
  signedFlowAmount,
} from '../models/flow';
import { SkippedOccurrence } from '../models/skipped-occurrence';
import { Transaction } from '../models/transaction';
import { Transfer } from '../models/transfer';
import { amountAtDate } from './amount-timeline';
import { budgetContribution, currentPeriod, previousCompletedPeriod } from './budget-period';
import { lastCompletedPeriod, mostRecentOccurrence, occurrencesInRange } from './cadence';

/** The sum of a Cadence's occurrences over `(startExclusive, endInclusive]`, each valued via its amount-change timeline. */
function cadenceTimelineContribution(
  cadence: Cadence,
  amount: number,
  changes: AmountChange[],
  startExclusive: Date,
  endInclusive: Date,
): number {
  return occurrencesInRange(cadence, startExclusive, endInclusive).reduce(
    (sum, occurrence) => sum + amountAtDate(amount, changes, occurrence),
    0,
  );
}

/**
 * A Flow's expected contribution over `(startExclusive, endInclusive]` as a positive
 * magnitude — a recurring-kind Flow's occurrence timeline, or a budget-kind Flow's prorated
 * limit — before `direction`'s sign is applied. Shared by `flowContribution` (the projection)
 * and `varianceAlert` (which compares this same magnitude against an actual total).
 */
function expectedFlowMagnitude(
  flow: Flow,
  changes: AmountChange[],
  startExclusive: Date,
  endInclusive: Date,
): number {
  return flow.kind === 'recurring'
    ? cadenceTimelineContribution(flow.cadence, flow.amount, changes, startExclusive, endInclusive)
    : budgetContribution(flow.period, flow.limit, changes, startExclusive, endInclusive);
}

function flowContribution(flow: Flow, startExclusive: Date, endInclusive: Date): number {
  const changes = flow.amountChanges ?? [];
  const magnitude = expectedFlowMagnitude(flow, changes, startExclusive, endInclusive);
  return signedFlowAmount(magnitude, flow.direction);
}

/** Every active Flow's expected contribution over `(startExclusive, endInclusive]`. */
function projectedFlowContribution(
  flows: Flow[],
  startExclusive: Date,
  endInclusive: Date,
): number {
  return flows.reduce((sum, flow) => sum + flowContribution(flow, startExclusive, endInclusive), 0);
}

/**
 * A Transfer's contribution to one side of itself: negative for the from-Account, positive
 * for the to-Account, zero for any Account that isn't a party to it — the symmetry that keeps
 * both sides of a Transfer from ever drifting out of sync.
 */
function transferContribution(
  transfer: Transfer,
  accountId: string,
  startExclusive: Date,
  endInclusive: Date,
): number {
  if (accountId !== transfer.fromAccountId && accountId !== transfer.toAccountId) return 0;

  const magnitude = cadenceTimelineContribution(
    transfer.cadence,
    transfer.amount,
    transfer.amountChanges ?? [],
    startExclusive,
    endInclusive,
  );
  return accountId === transfer.fromAccountId ? -magnitude : magnitude;
}

/** Every active Flow's and Transfer's expected contribution to `accountId` over `(startExclusive, endInclusive]`. */
function projectedContribution(
  accountId: string,
  flows: Flow[],
  transfers: Transfer[],
  startExclusive: Date,
  endInclusive: Date,
): number {
  return (
    projectedFlowContribution(flows, startExclusive, endInclusive) +
    transfers.reduce(
      (sum, transfer) =>
        sum + transferContribution(transfer, accountId, startExclusive, endInclusive),
      0,
    )
  );
}

/**
 * Per ADR-0001: the bank-reported balance at balanceDate is ground truth.
 * Past balances are reconstructed by walking backward through transactions;
 * future balances walk forward from the anchor via the Account's active Flows.
 */
export function balanceAtDate(
  account: Pick<Account, 'id' | 'balance' | 'balanceDate'>,
  transactions: Transaction[],
  date: Date,
  flows: Flow[],
  transfers: Transfer[] = [],
): number {
  if (date.getTime() >= account.balanceDate.getTime()) {
    return (
      account.balance +
      projectedContribution(account.id, flows, transfers, account.balanceDate, date)
    );
  }

  const postedSinceDate = transactions
    .filter(
      (txn) =>
        txn.date.getTime() > date.getTime() && txn.date.getTime() <= account.balanceDate.getTime(),
    )
    .reduce((sum, txn) => sum + txn.amount, 0);

  return account.balance - postedSinceDate;
}

export interface BalancePoint {
  date: Date;
  balance: number;
}

/** One balance sample per day across `dates`, for driving a chart's band. */
export function balanceSeries(
  account: Pick<Account, 'id' | 'balance' | 'balanceDate'>,
  transactions: Transaction[],
  dates: Date[],
  flows: Flow[],
  transfers: Transfer[] = [],
): BalancePoint[] {
  return dates.map((date) => ({
    date,
    balance: balanceAtDate(account, transactions, date, flows, transfers),
  }));
}

/**
 * The net total across every account at each of `dates` — the multi-account view's Total lane,
 * summed fresh over whatever `dates` the caller needs (the visible window, or the Total lane's
 * own wider color domain range — see #79) rather than derived from any one account's own series.
 */
export function totalBalanceSeries(
  accounts: Pick<Account, 'id' | 'balance' | 'balanceDate'>[],
  transactionsByAccount: Map<string, Transaction[]>,
  dates: Date[],
  flowsByAccount: Map<string, Flow[]>,
  transfersByAccount: Map<string, Transfer[]> = new Map(),
): number[] {
  return dates.map((date) =>
    accounts.reduce(
      (sum, account) =>
        sum +
        balanceAtDate(
          account,
          transactionsByAccount.get(account.id) ?? [],
          date,
          flowsByAccount.get(account.id) ?? [],
          transfersByAccount.get(account.id) ?? [],
        ),
      0,
    ),
  );
}

/** Per CONTEXT.md's Projection Horizon: the rolling forward-looking window Running-Dry Alerts are evaluated within. */
export const PROJECTION_HORIZON_DAYS = 90;

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Per ADR-0012's Consequences: how long a missed occurrence stays Outstanding before it reverts to normal. */
const OUTSTANDING_GRACE_PERIOD_DAYS = 14;

export interface RunningDryAlert {
  date: Date;
  balance: number;
}

/**
 * The earliest date within the Projection Horizon (inclusive of `today`) at which the
 * Account's projected balance is expected to cross below its Dry Floor, or null if it doesn't.
 * Scans day by day rather than only at period boundaries, since a budget-kind Flow's prorated
 * contribution moves continuously rather than only stepping at period edges. Always null for a
 * liability Account (`expectedSign: -1`), which has no Dry Floor to cross.
 */
export function runningDryAlert(
  account: Pick<Account, 'id' | 'balance' | 'balanceDate' | 'dryFloor' | 'expectedSign'>,
  transactions: Transaction[],
  flows: Flow[],
  transfers: Transfer[],
  today: Date,
  horizonDays: number = PROJECTION_HORIZON_DAYS,
): RunningDryAlert | null {
  if (account.expectedSign === -1) return null;
  for (let offset = 0; offset <= horizonDays; offset++) {
    const date = addDays(today, offset);
    const balance = balanceAtDate(account, transactions, date, flows, transfers);
    if (balance < account.dryFloor) {
      return { date, balance };
    }
  }
  return null;
}

export interface VarianceAlert {
  flowId: string;
  periodStart: Date;
  periodEnd: Date;
  expected: number;
  actual: number;
}

/** Converts a Tolerance (percent or fixed) to a dollar amount against `expectedMagnitude`. Shared by `varianceAlert` and the Budgets list's proximity-band coloring. */
export function toleranceAmount(tolerance: Tolerance, expectedMagnitude: number): number {
  return tolerance.kind === 'percent'
    ? Math.abs(expectedMagnitude) * (tolerance.value / 100)
    : tolerance.value;
}

/**
 * A Flow's actual total for `(startExclusive, endInclusive]`, normalized to the same positive
 * magnitude its expected amount is expressed in — matched Transactions summed, then flipped
 * back through `direction`'s sign (the same multiply-by-±1 `signedFlowAmount` uses to go the
 * other way, and self-inverse since the sign is always ±1).
 */
function actualFlowMagnitude(
  flow: Flow,
  transactions: Transaction[],
  startExclusive: Date,
  endInclusive: Date,
): number {
  const upperBoundExclusive = addDays(endInclusive, 1);
  const signedTotal = transactions
    .filter(
      (txn) =>
        txn.matchedTarget?.kind === 'flow' &&
        txn.matchedTarget.id === flow.id &&
        txn.date.getTime() > startExclusive.getTime() &&
        txn.date.getTime() < upperBoundExclusive.getTime(),
    )
    .reduce((sum, txn) => sum + txn.amount, 0);
  return signedFlowAmount(signedTotal, flow.direction);
}

/**
 * Compares a Flow's most recently completed period — an occurrence-to-occurrence window for a
 * recurring-kind Flow, the prior calendar month/year for a budget-kind Flow — against its
 * Tolerance, returning a Variance Alert if it's outside. Symmetric (either direction) for a
 * recurring-kind Flow; for a budget-kind Flow, only the direction that hurts (over the limit
 * for an expense Budget, under for an income Budget) — per CONTEXT.md's Tolerance entry.
 * Returns null when the Flow has no Tolerance set or no period has completed yet.
 */
export function varianceAlert(
  flow: Flow,
  transactions: Transaction[],
  today: Date,
): VarianceAlert | null {
  if (!flow.tolerance) return null;

  const period =
    flow.kind === 'recurring'
      ? lastCompletedPeriod(flow.cadence, today)
      : previousCompletedPeriod(flow.period, today);
  if (!period) return null;

  const { startExclusive, endInclusive } = period;
  const changes = flow.amountChanges ?? [];
  const expected = expectedFlowMagnitude(flow, changes, startExclusive, endInclusive);
  const actual = actualFlowMagnitude(flow, transactions, startExclusive, endInclusive);

  const tolerance = toleranceAmount(flow.tolerance, expected);
  const diff = actual - expected;
  const breached =
    flow.kind === 'budget'
      ? flow.direction === 'out'
        ? diff > tolerance
        : diff < -tolerance
      : Math.abs(diff) > tolerance;
  if (!breached) return null;

  return {
    flowId: flow.id,
    periodStart: startExclusive,
    periodEnd: endInclusive,
    expected,
    actual,
  };
}

export interface OutstandingAlert {
  flowId: string;
  occurrenceDate: Date;
  amount: number;
}

/**
 * Per ADR-0012 / CONTEXT.md's Outstanding entry: a recurring-kind Flow's most recent occurrence
 * is Outstanding once the Account's `balanceDate` has advanced to or past that occurrence's date
 * with no Transaction matched to the Flow in `(previousOccurrence, today]` (or `(epoch, today]`
 * for a Flow's first-ever occurrence). Only the single latest occurrence is ever evaluated — a
 * Flow already Outstanding doesn't accumulate further. Returns null for a budget-kind Flow (no
 * occurrence timeline), when no occurrence has happened yet, once the occurrence is more than
 * `OUTSTANDING_GRACE_PERIOD_DAYS` days overdue (per ADR-0012's Consequences), or when the
 * occurrence's exact `(flowId, occurrenceDate)` pair appears in `skippedOccurrences` — a
 * user-dismissed occurrence (ADR-0014) reverts to normal the same as an expired one, but stays
 * that way regardless of how much time passes. A later occurrence of the same Flow is a different
 * pair, so it isn't affected by an earlier one's skip.
 */
export function outstandingAlert(
  flow: Flow,
  transactions: Transaction[],
  account: Pick<Account, 'balanceDate'>,
  today: Date,
  skippedOccurrences: SkippedOccurrence[] = [],
): OutstandingAlert | null {
  if (flow.kind !== 'recurring') return null;

  const found = mostRecentOccurrence(flow.cadence, today);
  if (!found) return null;
  const { windowStart, occurrence } = found;
  if (account.balanceDate.getTime() < occurrence.getTime()) return null;

  const daysOverdue = (startOfDay(today).getTime() - startOfDay(occurrence).getTime()) / MS_PER_DAY;
  if (daysOverdue > OUTSTANDING_GRACE_PERIOD_DAYS) return null;

  const isSkipped = skippedOccurrences.some(
    (s) => s.flowId === flow.id && s.occurrenceDate.getTime() === occurrence.getTime(),
  );
  if (isSkipped) return null;

  // Day-inclusive of today's calendar date, matching `actualFlowMagnitude`'s own end-of-day
  // boundary handling — a match posted later today (after whatever time-of-day `today` itself
  // carries) still counts, rather than only up to the exact instant `today` represents.
  const upperBoundExclusive = addDays(startOfDay(today), 1);
  const hasMatch = transactions.some(
    (txn) =>
      txn.matchedTarget?.kind === 'flow' &&
      txn.matchedTarget.id === flow.id &&
      txn.date.getTime() > windowStart.getTime() &&
      txn.date.getTime() < upperBoundExclusive.getTime(),
  );
  if (hasMatch) return null;

  const amount = amountAtDate(flow.amount, flow.amountChanges ?? [], occurrence);
  return { flowId: flow.id, occurrenceDate: occurrence, amount };
}

/**
 * Every currently-Outstanding recurring-kind Flow, synthesized as an ad hoc one-time occurrence
 * dated `today` and appended to `flows`. Restores the missing amount to the forward projection
 * (`balanceAtDate`/`balanceSeries`/`runningDryAlert`/`totalBalanceSeries`) that would otherwise
 * silently drop it the moment `balanceDate` passes the missed occurrence — see ADR-0012. Resolves
 * itself automatically on the next call once a Transaction matches, `balanceDate` moves again, the
 * occurrence passes `outstandingAlert`'s 14-day grace period, or it's recorded in
 * `skippedOccurrences` (ADR-0014) — a skip removes the expected amount from the projection just
 * like a normal resolution would.
 */
export function withOutstandingOccurrences(
  flows: Flow[],
  transactions: Transaction[],
  account: Pick<Account, 'balanceDate'>,
  today: Date,
  skippedOccurrences: SkippedOccurrence[] = [],
): Flow[] {
  const synthetic: RecurringFlow[] = [];
  for (const flow of flows) {
    const alert = outstandingAlert(flow, transactions, account, today, skippedOccurrences);
    if (!alert) continue;
    synthetic.push({
      id: `${flow.id}-outstanding`,
      accountId: flow.accountId,
      name: flow.name,
      direction: flow.direction,
      kind: 'recurring',
      amount: alert.amount,
      cadence: { period: 'once', date: today },
    });
  }
  return synthetic.length === 0 ? flows : [...flows, ...synthetic];
}

/**
 * How much of a budget-kind Flow's current, in-progress Budget Period has been used — the
 * Budgets list's progress bar (see #72). `used` is clamped to a non-negative magnitude (a
 * partial refund landing against an otherwise-unused Budget shouldn't show as negative
 * progress); `limit` reflects any Step Change/Recurring Rule in effect as of `today`.
 */
export function budgetProgress(
  flow: BudgetFlow,
  transactions: Transaction[],
  today: Date,
): { used: number; limit: number } {
  const { startExclusive, endInclusive } = currentPeriod(flow.period, today);
  const used = Math.max(0, actualFlowMagnitude(flow, transactions, startExclusive, endInclusive));
  const limit = amountAtDate(flow.limit, flow.amountChanges ?? [], today);
  return { used, limit };
}

export type BudgetProgressStatus = 'ok' | 'warn' | 'over';

/**
 * The Budgets list row's color state for `used` against `limit` — distinct from
 * `varianceAlert`'s single-directional breach check against a *completed* period. This reads
 * Tolerance as a **symmetric** band around `limit` (`limit ± toleranceAmount`) against the
 * *in-progress* period's `used` from `budgetProgress`, regardless of the Flow's `direction`. See
 * ADR-0011. With no Tolerance set, there's no `warn` band — `ok` through `limit`, `over` past it.
 */
export function budgetProgressStatus(
  used: number,
  limit: number,
  tolerance: Tolerance | undefined,
): BudgetProgressStatus {
  if (!tolerance) return used > limit ? 'over' : 'ok';

  const amount = toleranceAmount(tolerance, limit);
  if (used > limit + amount) return 'over';
  if (used >= limit - amount) return 'warn';
  return 'ok';
}

/** A budget-kind Flow's Budget Period, expressed as its monthly-equivalent share — a year-period Budget's once-a-year limit spread over its 12 months, a month-period Budget as-is. */
const MONTHLY_PRORATION_FACTOR: Record<BudgetFlow['period'], number> = { month: 1, year: 1 / 12 };

/**
 * The combined spending picture across every `direction: 'out'` budget-kind Flow — the
 * Budgets list summary's total (#103). Reuses each Flow's own `budgetProgress` rather than
 * re-deriving it, then prorates a year-period Budget's `used`/`limit` to its monthly-equivalent
 * share (symmetrically, on both sides of the ratio) before summing, so a once-a-year expense
 * contributes its monthly share rather than distorting the combined total. `direction: 'in'`
 * budgets (income tracking) are excluded — they have no coherent "spent against" story to fold
 * into a spending total.
 */
export function aggregateBudgetProgress(
  flows: Flow[],
  transactions: Transaction[],
  today: Date,
): { used: number; limit: number } {
  return flows
    .filter((flow): flow is BudgetFlow => flow.kind === 'budget' && flow.direction === 'out')
    .reduce(
      (totals, flow) => {
        const { used, limit } = budgetProgress(flow, transactions, today);
        const factor = MONTHLY_PRORATION_FACTOR[flow.period];
        return { used: totals.used + used * factor, limit: totals.limit + limit * factor };
      },
      { used: 0, limit: 0 },
    );
}

/** The average number of days in a month, for converting a day-based history span into a month count. */
const AVG_DAYS_PER_MONTH = 30;

/**
 * The account's actual average monthly income over the trailing `windowMonths` back from
 * `asOf` — the Budgets list summary's income comparison (#103). Included in the sum: every
 * Transaction in the window with a non-negative amount, except one already matched to a
 * Transfer (moving money between the user's own Accounts isn't income); an uncategorized
 * Transaction is included, since real income may never get tied to a Flow at all.
 *
 * Divides by however much of the window the Account's transaction history actually spans
 * (found from `transactions` as a whole, not just the in-window income ones), capped at
 * `windowMonths` — a newer Account's figure reflects a genuine monthly average rather than
 * being divided by a fixed window regardless of how much history exists.
 */
export function averageMonthlyIncome(transactions: Transaction[], asOf: Date, windowMonths: number): number {
  const windowStart = addDays(asOf, -windowMonths * AVG_DAYS_PER_MONTH);

  const earliestOverall = transactions.reduce<Date | null>(
    (min, txn) => (min === null || txn.date.getTime() < min.getTime() ? txn.date : min),
    null,
  );
  if (earliestOverall === null) return 0;

  const effectiveStart = earliestOverall.getTime() > windowStart.getTime() ? earliestOverall : windowStart;
  const spanDays = Math.max(1, (asOf.getTime() - effectiveStart.getTime()) / MS_PER_DAY);
  const monthsSpanned = Math.min(windowMonths, spanDays / AVG_DAYS_PER_MONTH);

  const income = transactions
    .filter(
      (txn) =>
        txn.date.getTime() > windowStart.getTime() &&
        txn.date.getTime() <= asOf.getTime() &&
        txn.amount >= 0 &&
        txn.matchedTarget?.kind !== 'transfer',
    )
    .reduce((sum, txn) => sum + txn.amount, 0);

  return income / monthsSpanned;
}
