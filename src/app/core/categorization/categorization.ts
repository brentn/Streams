import { CategorizationRule } from '../models/categorization-rule';
import { DirectCategorization } from '../models/direct-categorization';
import { MatchedTarget, Transaction } from '../models/transaction';

/** Canonical form for a Categorization Rule's match text — the key that makes exactly one rule exist per text. */
export function normalizeMatchText(text: string): string {
  return text.trim().toLowerCase();
}

/** The one substring-matching primitive both automatic matching and manual match-text validation share. */
export function isSubstringMatch(description: string, matchText: string): boolean {
  return description.toLowerCase().includes(normalizeMatchText(matchText));
}

/**
 * Matches a Transaction's description against Categorization Rules via
 * case-insensitive substring search. When more than one rule matches, the
 * longest (most specific) match text wins. Returns `null` when no rule
 * matches, surfacing the Transaction for manual assignment.
 */
export function matchTarget(description: string, rules: CategorizationRule[]): MatchedTarget | null {
  let best: CategorizationRule | null = null;
  for (const rule of rules) {
    const needle = normalizeMatchText(rule.matchText);
    if (!needle || !isSubstringMatch(description, needle)) continue;
    if (!best || needle.length > normalizeMatchText(best.matchText).length) {
      best = rule;
    }
  }

  return best?.target ?? null;
}

/**
 * Re-derives every Transaction's `matchedTarget` from the current rule set — the one place sync
 * and manual-correction call sites share this logic. A Transaction with a Direct Categorization
 * always resolves to that target, checked before rule-matching runs at all — never as a tiebreak
 * alongside it, since Direct Categorization has absolute precedence for as long as it exists (see
 * ADR-0018).
 */
export function categorizeTransactions(
  transactions: Transaction[],
  rules: CategorizationRule[],
  directCategorizations: DirectCategorization[] = [],
): Transaction[] {
  const directTargetByTransactionId = new Map(
    directCategorizations.map((d) => [d.transactionId, d.target]),
  );
  return transactions.map((t) => ({
    ...t,
    matchedTarget: directTargetByTransactionId.get(t.id) ?? matchTarget(t.description, rules),
  }));
}
