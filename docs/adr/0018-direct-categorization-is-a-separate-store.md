# Direct Categorization is a separate store, not a Categorization Rule variant

Surfaced by issue #105: Transactions with generic descriptions (e.g. "Transfer Out") need a way to be assigned to a Flow/Transfer without forcing every other Transaction sharing that text into the same target via a Categorization Rule.

**Decision**: model this as a new concept, Direct Categorization — `{transactionId, target}` in its own store, not a field on `Transaction` and not a Categorization Rule keyed by id instead of matchText.

- Not a rule variant: Categorization Rule's "longest match wins" tiebreak is string-length-based; an id-keyed entry has no natural length to compare, and folding it in would make `matchText` sometimes-not-text.
- Not a field on `Transaction`: `upsertTransactions` does a full-record `put` keyed by id on every resync (`storage-repository.ts:238`), sourced from freshly-fetched wire data that never reads the previously-stored record (`resync-known-accounts.ts:68`) — any such field would be silently dropped on the next sync. `Skipped Occurrence` (ADR-0014) established the pattern for this exact shape of problem: a separate store, keyed by id, read alongside the data it modifies rather than merged into it.
- Direct Categorization always takes absolute precedence over Categorization Rule matching, unconditionally, for as long as it exists — checked before rule-matching runs at all. Removing it reverts the Transaction to whatever rule-matching (or nothing) would otherwise derive.

## Consequences

- The matching pipeline (`categorization.ts`) gains a precedence check ahead of `matchTarget`, reading from the new store.
- `AssignFlowDialog` gains a mode toggle ("just this transaction" vs. "create a rule"); `matchText` only applies in rule mode.
- A new IndexedDB store and version bump; empty on migration, no existing-data rewrite needed (unlike ADR-0008's `matchedTarget` shape change).
