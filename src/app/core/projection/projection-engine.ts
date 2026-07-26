import { Account } from '../models/account';
import { Transaction } from '../models/transaction';

/**
 * Per ADR-0001: the bank-reported balance at balanceDate is ground truth.
 * Past balances are reconstructed by walking backward through transactions;
 * future balances continue flat until Flows/Transfers exist to drive them.
 */
export function balanceAtDate(
  account: Pick<Account, 'balance' | 'balanceDate'>,
  transactions: Transaction[],
  date: Date,
): number {
  if (date.getTime() >= account.balanceDate.getTime()) {
    return account.balance;
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
): BalancePoint[] {
  return dates.map((date) => ({ date, balance: balanceAtDate(account, transactions, date) }));
}
