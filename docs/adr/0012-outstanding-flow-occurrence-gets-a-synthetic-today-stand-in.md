# A Flow occurrence that's synced past without a match becomes Outstanding, backed by a synthetic today stand-in

`balanceAtDate` (`projection-engine.ts`) treats occurrences before `balanceDate` as bank-confirmed history and occurrences after it as projected from Cadence — but an occurrence whose date `balanceDate` has already passed, with no Transaction ever matched to it, falls into neither: it's excluded from the forward projection (only occurrences in `(balanceDate, date]` count) and from the backward reconstruction (which only sums Transactions that actually exist). The expected movement silently vanishes from the entire projection the moment sync catches up to it, understating a real pending obligation with no warning.

We call this per-occurrence state **Outstanding** (see CONTEXT.md) and synthesize a same-day stand-in: an ad hoc one-time Flow occurrence dated today, sized at the amount expected on the missed occurrence's date, merged into the same `flows` array `balanceAtDate`/`runningDryAlert`/`totalBalanceSeries` already consume — restoring the amount to the forward projection rather than just flagging it visually. It resolves itself automatically once a Transaction matches or a later sync moves the picture again.

## Considered Options

- **Fixed grace-period-in-days** before flagging, instead of reusing the occurrence-to-occurrence window `VarianceAlert` already checks — rejected: a new tunable with no precedent elsewhere in the domain.
- **Persisted flag on the Flow record** — rejected: every other alert in this codebase (`RunningDryAlert`, `VarianceAlert`, `budgetProgressStatus`) is a pure function of current state; a stored flag would need its own dismiss/cleanup machinery nothing else here has.
- **Accumulating every unmatched occurrence** since the last match into one summed total — rejected: capped at the single latest occurrence per Flow; a second occurrence going overdue while the first is unresolved reads as a different problem (broken Categorization Rule, cancelled payment), not more lateness.
- **One shared bucket per direction**, mirroring the Uncategorized bucket (ADR-0007) — rejected in favor of one stand-in per Outstanding Flow, individually traceable by `flowId` back to a real `TributaryPanel`, even though several could land on the same day.
- **Visual-only stand-in**, no effect on balance math — rejected: would leave the exact accuracy gap this decision exists to close, unfixed.

## Consequences

- Scoped to recurring-kind Flows only. Budget-kind Flows have no occurrence to go Outstanding; Transfers share the same Cadence machinery but aren't covered by this decision.
- The stand-in's UI label reads "Pending: `<Flow name>`" — a display-text choice only; the domain/code term stays Outstanding throughout (CONTEXT.md, `outstandingAlert`, etc.) to avoid two names for one concept.
- A one-time (`period: 'once'`) Cadence Flow is in scope like any recurring one — a single missed one-time payment gets flagged and stood-in the same way.
- If the stand-in (or the original occurrence's own marker) falls inside a clustered Tributary bundle (`tributary-bundles.ts`), the bundle's count badge must signal it contains an Outstanding item rather than reading as an ordinary bundle.
