import { IgnoredTransaction } from '../models/ignored-transaction';

/** Whether `transactionId` has a persisted Ignored record — the one suppression check shared by every list/total that respects it (ADR-0019). */
export function isIgnored(transactionId: string, ignoredTransactions: IgnoredTransaction[]): boolean {
  return ignoredTransactions.some((i) => i.transactionId === transactionId);
}
