import { Account } from '../models/account';
import {
  AmountChange,
  BudgetFlow,
  Cadence,
  Flow,
  Tolerance,
  signedFlowAmount,
} from '../models/flow';
import { Transaction } from '../models/transaction';
import { Transfer } from '../models/transfer';
import { amountAtDate } from './amount-timeline';
import { budgetContribution, currentPeriod, previousCompletedPeriod } from './budget-period';
import { lastCompletedPeriod, occurrencesInRange } from './cadence';

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

export interface RunningDryAlert {
  date: Date;
  balance: number;
}

/**
 * The earliest date within the Projection Horizon (inclusive of `today`) at which the
 * Account's projected balance is expected to cross below its Dry Floor, or null if it doesn't.
 * Scans day by day rather than only at period boundaries, since a budget-kind Flow's prorated
 * contribution moves continuously rather than only stepping at period edges.
 */
export function runningDryAlert(
  account: Pick<Account, 'id' | 'balance' | 'balanceDate' | 'dryFloor'>,
  transactions: Transaction[],
  flows: Flow[],
  transfers: Transfer[],
  today: Date,
  horizonDays: number = PROJECTION_HORIZON_DAYS,
): RunningDryAlert | null {
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
