# 04 — Reconcile CONTEXT.md, the spec, and issues 02/04 for the Flow/Budget split

**Type:** wayfinder:task
**Status:** closed
**Claimed by:** claude-session-2026-07-25
**Blocked by:** 01, 02, 03

## Question

Once budget-kind Flow's period/rollover/alert semantics (ticket 02) and recurring-kind Flow's expanded cadence (ticket 03) are decided (ticket 01 already resolved: Budget is a `Flow.kind`, not a separate entity — Categorization Rules untouched), write the split into the actual docs:

- `CONTEXT.md` — correct Flow's Language entry to describe the two kinds (`recurring` / `budget`) and their kind-specific fields; do *not* add Budget as its own top-level term, since it isn't a separate entity.
- `.scratch/spec-streams-app.md` — correct the Solution section's "Recurring and budgeted income/expenses (Flows)" line, the Flows user stories, and the Flow schema sketch to show `kind` plus kind-specific fields (no separate Budget entity in the schema sketch).
- `.scratch/streams-app/issues/02-flows-drive-projection.md` — check whether it needs amended scope to cover both Flow kinds.
- `.scratch/streams-app/issues/04-step-changes-recurring-rules.md` — check whether the expanded cadence changes this issue's scope, and whether it should note that Step Changes/Recurring Rules apply only to recurring-kind Flows.

This is a task, not a decision — nothing left to decide once 01–03 resolve, just the writing-up.

## Resolution

Written up across four files:

- `CONTEXT.md` — Flow's Language entry now describes the two kinds; new `Cadence` and `Budget Period` terms under Scheduling; `Tolerance`/`Variance Alert` amended for direction-mirroring; new `Persistent Overrun Alert` term added under Alerts.
- `.scratch/spec-streams-app.md` — Solution paragraph, Flows/Alerts user stories (renumbered 9–19 and 28–32), Flow schema sketch, Projection Engine/Testing Decisions descriptions, and Out of Scope all corrected for the two-kind split; added a Further Notes pointer back to this map.
- `.scratch/streams-app/issues/02-flows-drive-projection.md` — checklist split into kind-specific items (recurring cadence vs. budget period/limit), with a pointer to this map.
- `.scratch/streams-app/issues/04-step-changes-recurring-rules.md` — added a scope note that it applies only to recurring-kind Flow.

No further decisions remained — this was pure write-up of tickets 01–03's resolutions.

