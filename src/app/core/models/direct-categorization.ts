import { MatchedTarget } from './transaction';

/**
 * Assigns one specific, already-existing Transaction to a Flow-or-Transfer target directly,
 * bypassing Categorization Rule matching entirely. Kept in its own store, keyed by
 * `transactionId` — never merged into the Transaction record itself, so it survives the
 * full-record overwrite every resync performs (see ADR-0018). Always takes absolute precedence
 * over Categorization Rule matching for that Transaction, for as long as it exists. See
 * CONTEXT.md's Direct Categorization entry.
 */
export interface DirectCategorization {
  transactionId: string;
  target: MatchedTarget;
}
