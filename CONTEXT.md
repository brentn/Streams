# Streams

A personal finance app that models bank accounts as streams you scroll through time, projecting future balances from recurring flows and warning when an account is at risk of running dry.

## Language

**Flow**:
A single expected movement of money into or out of one Account, on a schedule, with a Tolerance for how far actuals can vary before it's flagged.
_Avoid_: Category, budget item

**Transfer**:
A single expected movement of money between two Accounts (a from-Account and a to-Account), scheduled with the same Step Change / Recurring Rule machinery as a Flow, applied symmetrically to both Accounts' projections at once. Distinct from a Flow, which touches only one Account.
_Avoid_: Linked flows, paired flows

### Scheduling

**Step Change**:
A one-time, manually entered change to a Flow's (or Transfer's) amount, effective from a chosen date forward until superseded.
_Avoid_: Adjustment, override

**Recurring Rule**:
An automated, calendar-anchored Step Change that fires every year (e.g. "every October 1st") and applies as a delta to whatever the amount is at that moment. Recurring Rules and manual Step Changes form one ordered timeline of amount-changes — there is no separate "base" amount they reconcile against.
_Avoid_: Seasonal template, schedule override

### Categorization

**Categorization Rule**:
A case-insensitive substring match on a Transaction's merchant/description text, mapping it to a Flow. Exactly one rule exists per match text — correcting a Transaction's Flow overwrites that rule in place rather than adding a competing one. When multiple rules' match text fits the same Transaction, the longest (most specific) match wins.
_Avoid_: Mapping, auto-tag

### Alerts

**Tolerance**:
A per-Flow threshold, expressed as either a percentage or a fixed dollar amount, defining how far a period's actual total may differ from the expected amount — in either direction — before it triggers a Variance Alert.
_Avoid_: Margin, threshold

**Variance Alert**:
A notification that a Flow's actual total for a period fell outside its Tolerance.
_Avoid_: Budget alert

**Dry Floor**:
A configurable minimum balance for an Account (defaults to $0) — the level a projection crossing below triggers a Running-Dry Alert.
_Avoid_: Minimum balance, buffer

**Projection Horizon**:
The rolling forward-looking window (defaults to 90 days) within which Running-Dry Alerts are evaluated. Projections further out than this aren't surfaced as alerts.
_Avoid_: Forecast range

**Running-Dry Alert**:
A notification that an Account's projected balance is expected to cross below its Dry Floor within the Projection Horizon. Evaluated per Account, distinct from a Variance Alert, which is evaluated per Flow.
_Avoid_: Low balance warning
