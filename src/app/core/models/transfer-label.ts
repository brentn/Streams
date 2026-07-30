import { Account } from './account';
import { Transfer } from './transfer';

/** Framed from `accountId`'s point of view — Transfer has no name of its own. Shared by `AssignFlowDialog`'s picker and `TributaryPanel`'s header/badge, so the same Transfer reads identically in both places. */
export function transferLabel(transfer: Transfer, accountId: string, accounts: Account[]): string {
  const otherId = transfer.fromAccountId === accountId ? transfer.toAccountId : transfer.fromAccountId;
  const otherName = accounts.find((a) => a.id === otherId)?.name ?? '(unknown account)';
  return transfer.fromAccountId === accountId ? `Transfer to ${otherName}` : `Transfer from ${otherName}`;
}
