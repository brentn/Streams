# Streams

A personal finance app that models bank accounts as streams you scroll through time, projecting future balances from recurring flows and warning when an account is at risk of running dry.

## Language

**Flow**:
A single expected movement of money into or out of one Account, matched to Transactions via Categorization Rules, with a Tolerance for how far actuals can vary before it's flagged. Every Flow is one of two kinds, fixed at creation (not convertible afterward — changing kind means deleting and recreating the Flow):
- **Recurring** — a movement whose date and frequency are known almost to the day (a paycheck, rent, a subscription), scheduled via a Cadence and optionally adjusted over time by Step Changes / Recurring Rules.
- **Budget** — a spending or income limit for a period (month or year), agnostic to when within that period Transactions land. Resets cleanly at each period boundary; no rollover of unused or overspent amounts.
_Avoid_: Category, budget item (as a synonym for Flow in general — Budget is one specific kind of Flow, not the umbrella term)

**Transfer**:
A single expected movement of money between two Accounts (a from-Account and a to-Account), scheduled with the same Step Change / Recurring Rule machinery as a Flow, applied symmetrically to both Accounts' projections at once. Distinct from a Flow, which touches only one Account.
_Avoid_: Linked flows, paired flows

### Scheduling

**Cadence**:
A recurring-kind Flow's schedule: `{ period: week | month | year, interval, anchors }`. `anchors` holds one or more values shaped by `period` — a day-of-week (week), a day-of-month or nth-weekday-of-month pattern like "last Wednesday" (month), or a month-and-day (year). Named options a user picks from (weekly, biweekly, monthly, bi-monthly, semi-monthly, annually, semi-annually, "Nth weekday of month") each resolve to one shape of this recurrence rather than being separate schema branches. Applies only to a recurring-kind Flow — a budget-kind Flow has no Cadence, only a Budget Period.
_Avoid_: Frequency, recurrence rule (reserve "Recurring Rule" below for the distinct amount-change mechanism)

**Budget Period**:
A budget-kind Flow's `month | year` window over which its limit applies. Resets cleanly at each boundary — no rollover of unused or overspent amounts into the next period.
_Avoid_: Cadence (deliberately simpler — no anchors, no timing within the period)

**Step Change**:
A one-time, manually entered change to a Flow's (or Transfer's) amount, effective from a chosen date forward until superseded.
_Avoid_: Adjustment, override

**Recurring Rule**:
An automated, calendar-anchored Step Change that fires every year (e.g. "every October 1st") and applies as a delta to whatever the amount is at that moment. Recurring Rules and manual Step Changes form one ordered timeline of amount-changes — there is no separate "base" amount they reconcile against. Independent of Cadence: Cadence governs how often a recurring-kind Flow's amount is expected, Recurring Rule governs how the amount itself changes over time — a semi-monthly rent Flow can still carry an annual Recurring Rule that bumps the amount every October.
_Avoid_: Seasonal template, schedule override

### Categorization

**Categorization Rule**:
A case-insensitive substring match on a Transaction's merchant/description text, mapping it to a Flow. Exactly one rule exists per match text — correcting a Transaction's Flow overwrites that rule in place rather than adding a competing one. When multiple rules' match text fits the same Transaction, the longest (most specific) match wins.
_Avoid_: Mapping, auto-tag

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
A configurable minimum balance for an Account (defaults to $0) — the level a projection crossing below triggers a Running-Dry Alert.
_Avoid_: Minimum balance, buffer

**Projection Horizon**:
The rolling forward-looking window (defaults to 90 days) within which Running-Dry Alerts are evaluated. Projections further out than this aren't surfaced as alerts.
_Avoid_: Forecast range

**Running-Dry Alert**:
A notification that an Account's projected balance is expected to cross below its Dry Floor within the Projection Horizon. Evaluated per Account, distinct from a Variance Alert, which is evaluated per Flow.
_Avoid_: Low balance warning
