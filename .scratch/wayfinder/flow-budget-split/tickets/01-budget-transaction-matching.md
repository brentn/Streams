# 01 — Budget transaction-matching mechanism

**Type:** wayfinder:grilling
**Status:** closed
**Claimed by:** claude-session-2026-07-25
**Blocked by:** none

## Question

How does a Budget determine which synced Transactions count against it for a given period?

Two candidate shapes surfaced while charting the map, not yet decided between:

- Reuse the existing Categorization Rule / Flow-matching machinery (a Budget attaches to one or more Categorization Rules, same substring/longest-match mechanics Flows use).
- A separate category concept specific to Budget, independent of how Flows match transactions today.

Standing constraint from the map's Notes: Flow and Budget are mutually exclusive — whatever matching mechanism Budget uses, a transaction must resolve to exactly one of Flow or Budget, never both. This ticket needs to decide how that resolution actually works alongside Flow's existing Categorization Rules.

## Resolution

There is no separate Budget entity competing with Flow for Categorization Rules. **Budget and recurring income/expense are two *kinds* of Flow** — `Flow.kind: 'recurring' | 'budget'`, fixed at creation (not convertible in place; changing kind means deleting and recreating the Flow, since the two kinds carry non-overlapping data: a recurring Flow's Step Change/Recurring Rule timeline vs. a budget Flow's period + limit).

Categorization Rules are untouched: `{ matchText, flowId }` still points at a single Flow, exactly as today. Mutual exclusivity (a transaction resolves to exactly one of recurring-or-budget) falls out for free, because a transaction resolves to one Flow via one rule, and that Flow has exactly one `kind` — no new tie-breaking logic needed between two separate matching systems.

This reframes the map: "Budget" isn't a new top-level concept, it's a Flow kind. Tickets 02–04 updated to reflect this.

