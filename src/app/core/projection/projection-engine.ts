import { Account } from '../models/account';
import { AmountChange, Cadence, Flow, signedFlowAmount } from '../models/flow';
import { Transaction } from '../models/transaction';
import { Transfer } from '../models/transfer';
import { amountAtDate } from './amount-timeline';
import { budgetContribution } from './budget-period';
import { occurrencesInRange } from './cadence';

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

function flowContribution(flow: Flow, startExclusive: Date, endInclusive: Date): number {
  const changes = flow.amountChanges ?? [];
  const magnitude =
    flow.kind === 'recurring'
      ? cadenceTimelineContribution(flow.cadence, flow.amount, changes, startExclusive, endInclusive)
      : budgetContribution(flow.period, flow.limit, changes, startExclusive, endInclusive);
  return signedFlowAmount(magnitude, flow.direction);
}

/** Every active Flow's expected contribution over `(startExclusive, endInclusive]`. */
function projectedFlowContribution(flows: Flow[], startExclusive: Date, endInclusive: Date): number {
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
      (sum, transfer) => sum + transferContribution(transfer, accountId, startExclusive, endInclusive),
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
