import { Transaction } from '../models/transaction';
import { StorageRepository } from '../storage/storage-repository';

/**
 * Deletes a Flow and cascades: every Categorization Rule targeting it is deleted too — otherwise
 * a future sync would silently re-match Transactions back onto the deleted Flow's id — every
 * Direct Categorization targeting it is deleted too, for the same reason (it would otherwise
 * resurrect the dead target on the very next sync via `categorizeTransactions`' precedence check)
 * — and every Transaction currently matched to it becomes unassigned (`matchedTarget: null`).
 */
export async function deleteFlowCascade(
  storage: StorageRepository,
  transactions: Transaction[],
  flowId: string,
): Promise<Transaction[]> {
  const [rules, directCategorizations] = await Promise.all([
    storage.getCategorizationRules(),
    storage.getDirectCategorizations(),
  ]);
  const targetingRules = rules.filter((rule) => rule.target.kind === 'flow' && rule.target.id === flowId);
  const targetingDirectCategorizations = directCategorizations.filter(
    (d) => d.target.kind === 'flow' && d.target.id === flowId,
  );
  await Promise.all([
    ...targetingRules.map((rule) => storage.deleteCategorizationRule(rule.matchText)),
    ...targetingDirectCategorizations.map((d) => storage.deleteDirectCategorization(d.transactionId)),
  ]);

  const unassigned = transactions.map((txn) =>
    txn.matchedTarget?.kind === 'flow' && txn.matchedTarget.id === flowId
      ? { ...txn, matchedTarget: null }
      : txn,
  );
  const changed = unassigned.filter((txn, i) => txn !== transactions[i]);
  if (changed.length > 0) await storage.upsertTransactions(changed);

  await storage.deleteFlow(flowId);

  return unassigned;
}
