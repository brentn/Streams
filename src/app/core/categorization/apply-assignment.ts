import { Flow } from '../models/flow';
import { MatchedTarget, Transaction } from '../models/transaction';
import { StorageRepository } from '../storage/storage-repository';
import { categorizeTransactions } from './categorization';

/** Structurally identical to `AssignFlowDialogResult` (the feature-layer type) — kept separate so this core-layer module doesn't import from `features/`. */
export interface Assignment {
  matchText: string;
  target: MatchedTarget;
  /** Set when the chosen Flow was just created inline and doesn't exist in storage yet. */
  newFlow?: Flow;
}

/**
 * Persists an assignment as a Categorization Rule (and any newly-created Flow), then
 * re-derives `matchedTarget` for every given Transaction — not just the one being corrected —
 * so any other already-synced Transaction sharing that merchant text picks up the correction
 * immediately. Shared by `TransactionReview` and `TributaryPanel`, the two places a Transaction
 * gets (re)categorized, so neither duplicates this orchestration.
 */
export async function applyAssignment(
  storage: StorageRepository,
  transactions: Transaction[],
  { matchText, target, newFlow }: Assignment,
): Promise<Transaction[]> {
  if (newFlow) await storage.upsertFlow(newFlow);
  await storage.upsertCategorizationRule({ matchText, target });
  const rules = await storage.getCategorizationRules();
  const recategorized = categorizeTransactions(transactions, rules);
  await storage.upsertTransactions(recategorized);
  return recategorized;
}
