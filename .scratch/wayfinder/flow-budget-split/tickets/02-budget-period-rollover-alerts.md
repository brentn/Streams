# 02 — Budget period, rollover, and alert semantics

**Type:** wayfinder:grilling
**Status:** closed
**Claimed by:** claude-session-2026-07-25
**Blocked by:** none

## Question

What period(s) can a budget-kind Flow be set over (month, year, both, user-chosen)? What happens to an unused or overspent amount at a period boundary — does it roll over, reset to zero, or something else? And does going over budget need its own alert (parallel to a recurring Flow's Variance Alert), or does it reuse existing alert machinery?

Standing constraint (per ticket 01's resolution — budget is a `Flow.kind`, not a separate entity): a budget-kind Flow affects the Account balance projection the same way a recurring-kind Flow does (it contributes an expected amount forward), so whatever period/rollover model is chosen needs to produce a well-defined expected amount for the projection to consume — not just an actuals-only running total.

## Resolution

**Period:** `period: 'month' | 'year'`, chosen per Budget — not an arbitrary user-defined length. This is a separate, simpler field from recurring-kind Flow's `{ period, interval, anchors }` cadence (ticket 03) — no anchors, no interval, no timing within the period.

**Rollover:** none. Each period resets cleanly to the full limit regardless of prior over/under-spend — no carried balance, no compounding ledger. Matches the original framing: a budget is a cap for the period, whenever spending happens to land within it.

**Alerts — two distinct mechanisms, not one:**

1. **Tolerance-based, per-period, direction-mirrored.** Budget-kind Flow reuses the existing Tolerance shape (percent or fixed dollar), but the direction it guards is picked up from the Flow's existing `direction` field rather than a new axis:
   - `direction: 'out'` (expense budget) — alerts when actual spend exceeds `limit + tolerance` (over only; under-spending an expense budget is the goal, never alert-worthy).
   - `direction: 'in'` (income budget) — alerts when actual income falls short of `limit - tolerance` (under only; exceeding an income target is never alert-worthy).
2. **Repeated-overrun streak alert, fixed threshold, also direction-mirrored.** Fires after **3 consecutive periods** of being on the wrong side of the plain limit (not the tolerance-widened threshold) — i.e. 3 straight months (or years) over budget for an expense Budget, or 3 straight periods under target for an income Budget — even if no single period individually breached Tolerance. The streak count (3) is fixed, not configurable per Budget, unlike Tolerance.

This is a new alert concept, not a reuse of the existing per-Flow Variance Alert (which is symmetric over-or-under against a recurring Flow's expected amount) — Budget's tolerance-based alert is single-directional per the Flow's own `direction`, and the streak alert has no recurring-Flow analog at all.

