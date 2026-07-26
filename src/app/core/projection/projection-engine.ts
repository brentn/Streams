import { Account } from '../models/account';
import { Flow, signedFlowAmount } from '../models/flow';
import { Transaction } from '../models/transaction';
import { budgetContribution } from './budget-period';
import { occurrencesInRange } from './cadence';

function flowContribution(flow: Flow, startExclusive: Date, endInclusive: Date): number {
  const magnitude =
    flow.kind === 'recurring'
      ? flow.amount * occurrencesInRange(flow.cadence, startExclusive, endInclusive).length
      : budgetContribution(flow.period, flow.limit, startExclusive, endInclusive);
  return signedFlowAmount(magnitude, flow.direction);
}

/** Every active Flow's expected contribution over `(startExclusive, endInclusive]`. */
function projectedContribution(flows: Flow[], startExclusive: Date, endInclusive: Date): number {
  return flows.reduce((sum, flow) => sum + flowContribution(flow, startExclusive, endInclusive), 0);
}

/**
 * Per ADR-0001: the bank-reported balance at balanceDate is ground truth.
 * Past balances are reconstructed by walking backward through transactions;
 * future balances walk forward from the anchor via the Account's active Flows.
 */
export function balanceAtDate(
  account: Pick<Account, 'balance' | 'balanceDate'>,
  transactions: Transaction[],
  date: Date,
  flows: Flow[],
): number {
  if (date.getTime() >= account.balanceDate.getTime()) {
    return account.balance + projectedContribution(flows, account.balanceDate, date);
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
  account: Pick<Account, 'balance' | 'balanceDate'>,
  transactions: Transaction[],
  dates: Date[],
  flows: Flow[],
): BalancePoint[] {
  return dates.map((date) => ({
    date,
    balance: balanceAtDate(account, transactions, date, flows),
  }));
}
