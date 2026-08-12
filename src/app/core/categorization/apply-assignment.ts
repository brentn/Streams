import { Flow } from '../models/flow';
import { MatchedTarget, Transaction } from '../models/transaction';
import { StorageRepository } from '../storage/storage-repository';
import { categorizeTransactions, matchTarget } from './categorization';

/** Structurally identical to `AssignFlowDialogResult` (the feature-layer type) — kept separate so this core-layer module doesn't import from `features/`. */
export type Assignment =
  | {
      mode: 'rule';
      matchText: string;
      target: MatchedTarget;
      /** Set when the chosen Flow was just created inline and doesn't exist in storage yet. */
      newFlow?: Flow;
    }
  | {
      mode: 'direct';
      transactionId: string;
      target: MatchedTarget;
      /** Set when the chosen Flow was just created inline and doesn't exist in storage yet. */
      newFlow?: Flow;
    }
  | { mode: 'remove-direct'; transactionId: string }
  | { mode: 'ignore'; transactionId: string };

/**
 * Persists an Assignment and returns the given Transactions with `matchedTarget` brought up to
 * date.
 *
 * Rule mode upserts a Categorization Rule (and any newly-created Flow), then re-derives
 * `matchedTarget` for every given Transaction — not just the one being corrected — so any other
 * already-synced Transaction sharing that merchant text picks up the correction immediately.
 *
 * Direct/remove-direct mode upserts or deletes a Direct Categorization for exactly the named
 * Transaction and updates only that one Transaction's `matchedTarget` — a Direct Categorization
 * can't affect any other Transaction's matching by definition (ADR-0018), so there's nothing else
 * to re-derive.
 *
 * Ignore mode upserts an Ignored Transaction (ADR-0019) and returns `transactions` unchanged —
 * Ignored is orthogonal to `matchedTarget`, so nothing about matching is re-derived.
 *
 * Shared by `TransactionReview` and `TributaryPanel`, the two places a Transaction gets
 * (re)categorized, so neither duplicates this orchestration.
 */
export async function applyAssignment(
  storage: StorageRepository,
  transactions: Transaction[],
  assignment: Assignment,
): Promise<Transaction[]> {
  if (assignment.mode === 'rule') {
    const { matchText, target, newFlow } = assignment;
    if (newFlow) await storage.upsertFlow(newFlow);
    await storage.upsertCategorizationRule({ matchText, target });
    const [rules, directCategorizations] = await Promise.all([
      storage.getCategorizationRules(),
      storage.getDirectCategorizations(),
    ]);
    const recategorized = categorizeTransactions(transactions, rules, directCategorizations);
    await storage.upsertTransactions(recategorized);
    return recategorized;
  }

  if (assignment.mode === 'ignore') {
    await storage.upsertIgnoredTransaction({ transactionId: assignment.transactionId });
    return transactions;
  }

  const { transactionId } = assignment;
  let matchedTarget: MatchedTarget | null;
  if (assignment.mode === 'direct') {
    if (assignment.newFlow) await storage.upsertFlow(assignment.newFlow);
    await storage.upsertDirectCategorization({ transactionId, target: assignment.target });
    matchedTarget = assignment.target;
  } else {
    await storage.deleteDirectCategorization(transactionId);
    const rules = await storage.getCategorizationRules();
    const transaction = transactions.find((t) => t.id === transactionId);
    matchedTarget = transaction ? matchTarget(transaction.description, rules) : null;
  }

  const updated = transactions.map((t) => (t.id === transactionId ? { ...t, matchedTarget } : t));
  const changed = updated.find((t) => t.id === transactionId);
  if (changed) await storage.upsertTransactions([changed]);
  return updated;
}
