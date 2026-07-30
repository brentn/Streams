# Transfers become a valid Categorization target, alongside Flows

Surfaced while implementing #65 (Tributary drill-in & detail): the spec called for a recurring Transfer's drill-in panel to show "a transaction list grouped by date," the same way a recurring Flow's does. But the data model had no way to associate a real Transaction with a Transfer at all — `Transaction.matchedFlowId`, `CategorizationRule.flowId`, and `AssignFlowDialog`'s picker were all typed to `Flow` only. Neither #51, #55, nor #65 acknowledged this gap; it was resolved via `/grill-me` rather than guessed silently, and split out as its own ticket (#69) since it's a real data-model/storage change independent of the drill-in UI itself.

**Decision**: generalize "the thing a Transaction is matched to" from Flow-only to Flow-or-Transfer:

- `Transaction.matchedFlowId: string | null` → `Transaction.matchedTarget: MatchedTarget | null`, where `MatchedTarget = { kind: 'flow'; id: string } | { kind: 'transfer'; id: string }`.
- `CategorizationRule.flowId: string` → `CategorizationRule.target: MatchedTarget`.
- `AssignFlowDialog`'s picker lists both Flows and Transfers (two `<optgroup>`s); inline "+ New Flow" creation stays the only inline-creation affordance — Transfers are only picked from existing ones, created via the account screen's own Add Transfer flow.

**Migration shape**: every prior IndexedDB version bump (v2 through v11) was additive-only — a new optional field, normalized to a default at the read site, never touching existing records. This one is different: it changes an *existing* field's shape rather than adding one, so normalizing at the read site would mean permanently supporting two overlapping representations (`matchedFlowId` and `matchedTarget`) with no clear authority between them. We chose a real migration instead: the v11→v12 `upgrade` transaction cursor-iterates `transactions` and `categorizationRules`, rewriting `matchedFlowId`/`flowId` into `matchedTarget`/`target` in place. This is safe and unambiguous because every record written before v12 could only ever mean a Flow — there was no way to create a Transfer-targeting record under the old schema.

## Consequences

- `StorageRepository`'s `upgrade` callback is now `async` and takes the transaction's 4th (`transaction`) parameter, a first for this codebase — every future migration that needs to rewrite (not just add) a field's shape has this pattern to follow.
- `AssignFlowDialog` now needs `transfers: Transfer[]` and `accounts: Account[]` (to label a Transfer by its other Account, since Transfer has no name of its own) threaded in alongside `flows: Flow[]` — `TransactionReview` and `account-stream` both widened to pass them through.
- A Transfer, once it's the target of a Categorization Rule, has no Tolerance/Variance-Alert concept the way a Flow does — `projection-engine.ts`'s `actualFlowMagnitude` and `varianceAlert` remain Flow-only; nothing about this change makes a Transfer's actual Transactions feed into alerting, only into #65's drill-in transaction list.
