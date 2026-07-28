# Flow/Budget Split

**Label:** wayfinder:map
**Tracker:** migrated to GitHub as [brentn/Streams#19](https://github.com/brentn/Streams/issues/19) (2026-07-27), with tickets 01–04 as sub-issues [#20](https://github.com/brentn/Streams/issues/20)–[#23](https://github.com/brentn/Streams/issues/23). This file remains as local reference; GitHub is the source of truth going forward.

## Destination

A corrected domain model where what the original spec conflated into one `Flow` concept ("recurring and budgeted income/expenses") becomes **two kinds of the same `Flow` entity** (`Flow.kind: 'recurring' | 'budget'`, fixed at creation), not two sibling entities:

- **Recurring Flow**: a movement of money whose date and frequency are known almost to the day (e.g. biweekly paycheck, semi-monthly rent).
- **Budget Flow**: a spending limit for a period (month or year) that says nothing about when within that period the spending lands.

Categorization Rules are unaffected by the split — they still point `{ matchText, flowId }` at a single Flow regardless of its kind.

Reaching the end of this map means `CONTEXT.md`'s Language section, `.scratch/spec-streams-app.md`, and the affected local issues (`02-flows-drive-projection.md`, `04-step-changes-recurring-rules.md`) all reflect the two-kinds split, ready to hand to an implementation session. Neither kind has been built yet (no code exists for Flow at all), so this map is purely a spec/domain correction.

## Notes

- **Artifact:** decisions get written directly into `CONTEXT.md` (the domain glossary) as they resolve, per `docs/agents/domain.md` — plus corresponding edits to `.scratch/spec-streams-app.md` and local issues 02/04. No new artifact file; the existing domain doc and spec are amended in place.
- **Skills to consult:** `/domain-modeling` + `/grilling` for every ticket here — this whole map is domain-modeling work, no prototyping or research involved.
- **Standing decisions (2026-07-25 grilling, refined on ticket 01):**
  - Budget affects the Account balance projection — it contributes an expected amount to the forward projection, the same way a recurring Flow does. It is not purely an actuals-only tracking feature.
  - Budget and recurring are two kinds of one `Flow` entity (`Flow.kind`, fixed at creation), not separate sibling entities — mutual exclusivity between them falls out for free since Categorization Rules still resolve a transaction to exactly one Flow, which has exactly one kind.

## Decisions so far

- [01 — Budget transaction-matching mechanism](tickets/01-budget-transaction-matching.md) — No separate Budget entity/matching system: Budget and recurring are two kinds of one Flow (`Flow.kind`, fixed at creation), so the existing Categorization Rule → Flow matching is untouched.
- [03 — Recurring-kind Flow's expanded cadence](tickets/03-flow-expanded-cadence.md) — Flat `cadence` enum replaced by a generalized `{ period, interval, anchors }` recurrence shape (RRULE-style), covering weekly/biweekly/monthly/bi-monthly/semi-monthly/annually/semi-annually plus nth-weekday-of-month patterns (e.g. "last Wednesday") as named UI options over one shape. Step Change/Recurring Rule stay fully independent of cadence.
- [02 — Budget-kind Flow's period, rollover, and alert semantics](tickets/02-budget-period-rollover-alerts.md) — Period is `month | year`, no rollover (clean reset each period). Two alert mechanisms: a Tolerance-based alert mirroring the Flow's `direction` (over-only for expense budgets, under-only for income budgets), and a separate fixed 3-consecutive-period streak alert for repeated overrun even below Tolerance.
- [04 — Reconcile CONTEXT.md, the spec, and issues 02/04](tickets/04-reconcile-domain-docs.md) — `CONTEXT.md`, `.scratch/spec-streams-app.md`, and local issues 02/04 all updated to reflect the two-kinds-of-Flow model. No new decisions; pure write-up.
- **Correction (2026-07-27)**: ticket 04's write-up restricted Step Change/Recurring Rule to recurring-kind Flow only — that restriction was inherited by assumption from ticket 03's Cadence-scope decision, not independently argued, and didn't hold up on inspection. Corrected: Step Change/Recurring Rule apply to a Flow of either kind (a budget-kind Flow's limit carries the same amount-change timeline as a recurring-kind Flow's expected amount); Cadence itself remains recurring-kind only. See [brentn/Streams#13](https://github.com/brentn/Streams/issues/13) and correction comments on [#22](https://github.com/brentn/Streams/issues/22)/[#23](https://github.com/brentn/Streams/issues/23).

## Not yet specified

_(none — all fog graduated into tickets 01–03, all now resolved)_

## Out of scope

- UI/UX design for Budget or Flow's expanded cadence — both are unbuilt screens, already covered by the streams-ux-design map's scoping (screens not yet built are out of scope there too). This map only corrects the domain model and specs, not screens.
