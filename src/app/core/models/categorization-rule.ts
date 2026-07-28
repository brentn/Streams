/**
 * A case-insensitive substring match on a Transaction's description, mapping
 * it to a Flow. `matchText` is stored normalized (trimmed, lowercased) so it
 * doubles as the unique key — exactly one rule exists per match text, and
 * saving a rule for text that already has one overwrites it in place.
 */
export interface CategorizationRule {
  matchText: string;
  flowId: string;
}
