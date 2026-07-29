# Streams

A personal finance app that models bank accounts as streams you scroll through time, projecting future balances from recurring flows and warning when an account is at risk of running dry.

## Language

**Flow**:
A single expected movement of money into or out of one Account, matched to Transactions via Categorization Rules, with a Tolerance for how far actuals can vary before it's flagged, and an amount that can be adjusted over time via Step Changes / Recurring Rules regardless of kind. Every Flow is one of two kinds, fixed at creation (not convertible afterward — changing kind means deleting and recreating the Flow):
- **Recurring** — a movement whose date and frequency are known almost to the day (a paycheck, rent, a subscription), scheduled via a Cadence.
- **Budget** — a spending or income limit for a period (month or year), agnostic to when within that period Transactions land. Resets cleanly at each period boundary — no rollover of unused or overspent amounts from one period to the next — though the limit itself can still carry a Step Change or Recurring Rule (e.g. raising a grocery budget starting next month), since that's a deliberate edit to the limit, not a rollover.
_Avoid_: Category, budget item (as a synonym for Flow in general — Budget is one specific kind of Flow, not the umbrella term)

**Transfer**:
A single expected movement of money between two Accounts (a from-Account and a to-Account), scheduled the same way a recurring-kind Flow is — a Cadence plus the same Step Change / Recurring Rule amount-change machinery — applied symmetrically to both Accounts' projections at once (the from-Account's projection decreases, the to-Account's increases, by the same amount at the same time). Distinct from a Flow, which touches only one Account and can be either kind; a Transfer has no kind and no budget-style analog.
_Avoid_: Linked flows, paired flows

### Scheduling

**Cadence**:
A recurring-kind Flow's or a Transfer's schedule: `{ period: week | month | year, interval, anchors }`, or `{ period: once, date }` for a single, non-repeating occurrence. `anchors` holds one or more values shaped by `period` — a day-of-week (week), a day-of-month or nth-weekday-of-month pattern like "last Wednesday" (month), or a month-and-day (year); the `once` shape has no `interval`, `anchors`, or Anchor Date, since none of them describe a single occurrence. Named options a user picks from (weekly, biweekly, monthly, bi-monthly, semi-monthly, annually, semi-annually, "Nth weekday of month", One-time) each resolve to one shape of this recurrence rather than being separate schema branches. A repeating Cadence (any shape but `once`) may optionally carry an End Date; One-time doesn't offer one, since a single occurrence already terminates itself. Applies to a recurring-kind Flow and to a Transfer — a budget-kind Flow has no Cadence, only a Budget Period.
_Avoid_: Frequency, recurrence rule (reserve "Recurring Rule" below for the distinct amount-change mechanism)

**Anchor Date**:
A Cadence's reference point for fixing interval parity — e.g. which Friday is "on" for a biweekly Cadence, which month is "on" for bi-monthly. Only surfaced in the form for the two Cadence options where that parity is ambiguous (biweekly, bi-monthly); for every other option it's still set underneath, defaulted to the record's creation date. Also serves as the lower bound an End Date must fall on/after.
_Avoid_: Start date (it isn't when the Flow/Transfer "starts" in any user-facing sense — see End Date)

**End Date**:
An optional bound on a repeating Cadence (any shape but One-time): the last date on which an occurrence may still fire — inclusive, so an occurrence landing exactly on the End Date still happens. Leaving it unset means the Cadence repeats indefinitely, same as before End Date existed. Must fall on or after the Cadence's Anchor Date — the form blocks saving and warns otherwise. This holds even for the Cadence options that don't surface Anchor Date in the form (it's still set underneath, defaulted to the record's creation date) — a deliberate choice to keep the rule uniform across every repeating option rather than validating some and not others.
_Avoid_: Expiration, stop date

**Budget Period**:
A budget-kind Flow's `month | year` window over which its limit applies. Resets cleanly at each boundary — no rollover of unused or overspent amounts into the next period.
_Avoid_: Cadence (deliberately simpler — no anchors, no timing within the period)

**Step Change**:
A one-time, manually entered change to a Flow's (or Transfer's) amount, effective from a chosen date forward until superseded. Applies to a Flow of either kind — a recurring Flow's expected amount or a budget Flow's limit.
_Avoid_: Adjustment, override

**Recurring Rule**:
An automated, calendar-anchored Step Change that fires every year (e.g. "every October 1st") and applies as a delta to whatever the amount is at that moment. Recurring Rules and manual Step Changes form one ordered timeline of amount-changes — there is no separate "base" amount they reconcile against — and, like Step Change, apply to a Flow of either kind. Independent of Cadence: Cadence governs how often a recurring-kind Flow's amount is expected, Recurring Rule governs how the amount itself changes over time — a semi-monthly rent Flow can still carry an annual Recurring Rule that bumps the amount every October, and a budget Flow's limit can carry one the same way.
_Avoid_: Seasonal template, schedule override

### Categorization

**Categorization Rule**:
A case-insensitive substring match on a Transaction's merchant/description text, mapping it to a Flow. Exactly one rule exists per match text — correcting a Transaction's Flow overwrites that rule in place rather than adding a competing one. When multiple rules' match text fits the same Transaction, the longest (most specific) match wins.
_Avoid_: Mapping, auto-tag

### Sync

**Needs Reauthentication**:
An Account whose SimpleFIN sync is blocked because its stored credentials have been revoked or are otherwise invalid — signaled by a `con.auth`/`gen.auth` error code or an HTTP 403 on the accounts fetch, never inferred from error message text. A connection-level failure marks every Account under that connection this way at once, rather than being tracked as a separate Connection entity. Persists until the user reconnects via the SimpleFIN connect flow.
_Avoid_: Broken connection, expired token (the protocol doesn't distinguish expiry from revocation — both surface identically)

**Sync Issue**:
An Account whose most recent SimpleFIN sync reported a transient, non-blocking problem (an `act.failed`/`act.missingdata` error code, or an unrecognized one) — informational, no user action implied, expected to clear on a later sync. Distinct from Needs Reauthentication, which is blocking and actionable.
_Avoid_: Warning (ambiguous with other in-app warnings), sync error (too close to the blocking case)

### Alerts

**Tolerance**:
A per-Flow threshold, expressed as either a percentage or a fixed dollar amount, defining how far a period's actual total may differ from the expected amount before it triggers a Variance Alert. For a recurring-kind Flow this applies in either direction. For a budget-kind Flow it applies in the single direction that hurts, mirroring the Flow's `direction` — over the limit for an expense Budget, under the limit for an income Budget.
_Avoid_: Margin, threshold

**Variance Alert**:
A notification that a Flow's actual total for a period fell outside its Tolerance — symmetric (either direction) for a recurring-kind Flow, single-directional (mirroring `direction`) for a budget-kind Flow.
_Avoid_: Overrun alert (reserve for the distinct Persistent Overrun Alert below)

**Persistent Overrun Alert**:
A notification that a budget-kind Flow has been on the wrong side of its plain limit — not the Tolerance-widened threshold — for 3 consecutive Budget Periods: over budget for an expense Budget, or under target for an income Budget. Fires even when no single period breached Tolerance enough to trigger a Variance Alert. The streak length (3) is fixed, not configurable per Budget, unlike Tolerance. Applies only to a budget-kind Flow; has no recurring-kind analog.
_Avoid_: Streak alert, Budget alert (ambiguous with Variance Alert on a budget-kind Flow — prefer this term precisely)

**Dry Floor**:
A configurable minimum balance for an Account (defaults to $0) — the level a projection crossing below triggers a Running-Dry Alert. The UI displays this as "Minimum" — a deliberate UI-only label choice; the domain term and code identifiers (`dryFloor`) remain "Dry Floor".
_Avoid_: buffer

**Projection Horizon**:
The rolling forward-looking window (defaults to 90 days) within which Running-Dry Alerts are evaluated. Projections further out than this aren't surfaced as alerts.
_Avoid_: Forecast range

**Running-Dry Alert**:
A notification that an Account's projected balance is expected to cross below its Dry Floor within the Projection Horizon. Evaluated per Account, distinct from a Variance Alert, which is evaluated per Flow.
_Avoid_: Low balance warning
