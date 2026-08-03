import { Transaction } from '../models/transaction';
import { Transfer } from '../models/transfer';
import { StorageRepository } from '../storage/storage-repository';

/**
 * Deletes a Transfer and cascades: every Categorization Rule targeting it is deleted too — otherwise
 * a future sync would silently re-match Transactions back onto the deleted Transfer's id — and every
 * Transaction currently matched to it becomes unassigned (`matchedTarget: null`). A Transfer's matched
 * Transactions can live on either its fromAccountId or toAccountId Account, so both are fetched and
 * merged here rather than requiring the caller to know about the two-account mechanics.
 */
export async function deleteTransferCascade(
  storage: StorageRepository,
  transfer: Transfer,
): Promise<Transaction[]> {
  const rules = await storage.getCategorizationRules();
  const targetingRules = rules.filter(
    (rule) => rule.target.kind === 'transfer' && rule.target.id === transfer.id,
  );
  await Promise.all(targetingRules.map((rule) => storage.deleteCategorizationRule(rule.matchText)));

  const [fromTransactions, toTransactions] = await Promise.all([
    storage.getTransactionsForAccount(transfer.fromAccountId),
    storage.getTransactionsForAccount(transfer.toAccountId),
  ]);
  const transactions = [...fromTransactions, ...toTransactions];

  const unassigned = transactions.map((txn) =>
    txn.matchedTarget?.kind === 'transfer' && txn.matchedTarget.id === transfer.id
      ? { ...txn, matchedTarget: null }
      : txn,
  );
  const changed = unassigned.filter((txn, i) => txn !== transactions[i]);
  if (changed.length > 0) await storage.upsertTransactions(changed);

  await storage.deleteTransfer(transfer.id);

  return unassigned;
}
