/**
 * Marks one specific Transaction as suppressed from the surfaces that would otherwise show or
 * total it — the Needs-categorization list, the uncategorized-tributary bucket, a matched
 * Flow/Transfer's Tributary drill-in list, and every actual-total computation (Variance Alerts,
 * Budget totals, average income). Independent of `matchedTarget`: doesn't touch Direct
 * Categorization, Categorization Rules, or matching at all — a Transaction can be both matched
 * and Ignored at once. Stored in its own store, keyed by Transaction id, same reasoning as Direct
 * Categorization (ADR-0018): a resync's full-record `put` would silently drop a field added to
 * `Transaction` itself. See ADR-0019 and CONTEXT.md's Ignored entry.
 */
export interface IgnoredTransaction {
  transactionId: string;
}
