# Streams — v1 Spec

_Published to GitHub as [brentn/Streams#1](https://github.com/brentn/Streams/issues/1) (2026-07-27), superseding the earlier pre-Flow/Budget-split draft that had been posted there. Its user stories are tracked as implementation issues [#10](https://github.com/brentn/Streams/issues/10)–[#18](https://github.com/brentn/Streams/issues/18) (formerly the local stand-in files at `.scratch/streams-app/issues/01`–`09`, now historical) — see #1's comments for the full mapping. This file remains as local reference; GitHub is the source of truth going forward._

## Problem Statement

I don't have visibility into how my bank account balances will trend over time. I have to manually check multiple accounts and mentally track recurring bills and paychecks, and I'm sometimes surprised by a bill or don't notice until the last minute that an account is about to run low. I want to see, for each of my real bank accounts, what its balance was in the past and what it's projected to be in the future based on my recurring income and expenses — so I can catch cash-flow problems before they happen. Existing personal finance tools either charge an ongoing fee for bank-data access or require me to run my own backend, both of which have been blockers in the past.

## Solution

Streams models each connected bank Account as a stream you scroll through time. Income/expenses (Flows) and transfers between your own Accounts (Transfers) drive a projection: scroll backward to see actual history, scroll forward to see where the balance is headed. Every Flow is one of two kinds, fixed at creation: **recurring** (a date/frequency-known movement — a paycheck, rent) or **budget** (a spending or income limit for a month or year, agnostic to when within that period transactions land). The app raises a Variance Alert when a Flow's actual total drifts too far from what was expected — for a recurring Flow this is either direction, for a budget Flow only the direction that hurts (over for an expense budget, under for an income budget) — a Persistent Overrun Alert when a budget Flow is on the wrong side of its plain limit for 3 consecutive periods, and a Running-Dry Alert when an Account is projected to cross below its Dry Floor within the Projection Horizon. Bank data syncs via SimpleFIN Bridge, a low-cost ($1.50/mo), read-only aggregator paid directly by the user rather than baked into a per-app fee. The whole app is a static, client-only Angular site — no backend, no server-side storage of financial data — hosted on GitHub Pages, persisting everything in the browser's IndexedDB.

## User Stories

**Account sync**

1. As a user, I want to connect a real bank Account via SimpleFIN, so that its Transactions and current balance sync into the app automatically.
2. As a user, I want to see my current real balance for each connected Account, so that I know exactly what my bank says right now.
3. As a user, I want the app to re-sync my Accounts periodically, so that the actual/projected boundary keeps moving forward without manual effort.
4. As a user, I want to disconnect an Account, so that I can stop tracking one I no longer use.

**Stream navigation**

5. As a user, I want to scroll an Account's stream forward in time, so that I can see its projected balance on any future date.
6. As a user, I want to scroll an Account's stream backward in time, so that I can see its actual balance on any past date.
7. As a user, I want to see a clear visual distinction between the actual (past) and projected (future) portion of a stream, so that I know which numbers are certain and which are estimates.
8. As a user, I want the actual/projected boundary to update automatically as new Transactions sync in, so that yesterday's projection becomes today's actual without me doing anything.

**Flows**

9. As a user, I want to create a Flow of either kind — recurring or budget, chosen at creation and fixed thereafter — so that recurring income/expenses and period spending limits are modeled as the distinct things they are rather than one conflated concept.
10. As a user, I want to set a recurring Flow's cadence (weekly, biweekly, monthly, bi-monthly, semi-monthly, annually, semi-annually, or an "Nth weekday of month" pattern like "last Wednesday"), so that its expected amount recurs on the right rhythm, almost to the day.
11. As a user, I want to give a Flow a starting amount, so that the projection has a baseline expectation for it.
12. As a user, I want to add a Step Change to a Flow of either kind, so that I can change its expected amount (recurring) or limit (budget) from a specific date forward (e.g. a raise, a new rent price, a higher grocery budget).
13. As a user, I want to add a Recurring Rule to a Flow of either kind, so that its amount or limit automatically adjusts by a delta on a specific calendar date every year (e.g. a seasonal utility increase), independent of its cadence or period.
14. As a user, I want Step Changes and Recurring Rules to apply in chronological order against whatever the Flow's amount currently is, so that manual and automated adjustments compose correctly without a separate base amount to keep in sync.
15. As a user, I want to set a Flow's direction (in or out), so that the projection correctly adds or subtracts it.
16. As a user, I want to set a Tolerance on a Flow, as either a percentage or a fixed dollar amount, so that I control how far its actuals can vary before I'm alerted — in either direction for a recurring Flow, or in the single direction that hurts (over for an expense budget, under for an income budget) for a budget Flow.
17. As a user, I want to set a budget Flow's period (month or year), so that its limit resets cleanly each period with no rollover of unused or overspent amounts.
18. As a user, I want to be alerted after 3 consecutive periods of a budget Flow being over (or under, for income) its plain limit, even if no single period breached Tolerance, so that I notice a persistent pattern rather than just an occasional one-off.
19. As a user, I want to edit or delete a Flow, so that I can keep the model accurate as my real financial life changes.

**Transfers**

20. As a user, I want to create a Transfer between two of my own Accounts, so that moving money between them isn't mis-modeled as two unrelated income/expense Flows.
21. As a user, I want a Transfer to apply symmetrically to both Accounts' projections at once, so that the two sides can never drift out of sync.
22. As a user, I want to schedule a Transfer using the same Step Change / Recurring Rule mechanics as a Flow, so that scheduling works consistently across the app.

**Categorization**

23. As a user, I want incoming synced Transactions to automatically map to the right Flow based on merchant/description text, so that I don't have to manually categorize every transaction.
24. As a user, I want to manually assign or correct a Transaction's Flow, so that I can fix mis-categorized transactions.
25. As a user, I want a manual correction to update the Categorization Rule for that merchant text going forward, so that future transactions from the same merchant categorize correctly without repeating the correction.
26. As a user, when two Categorization Rules could match the same Transaction, I want the longest (most specific) match to win, so that overlapping merchant names resolve sensibly (e.g. "AMAZON PRIME" vs. "AMAZON").
27. As a user, I want to see Transactions that don't match any Categorization Rule, so that I can assign them a Flow myself.

**Alerts**

28. As a user, I want to receive a Variance Alert when a Flow's actual total for a period falls outside its Tolerance, so that I notice when a recurring cost has changed unexpectedly or a budget was breached in the direction that hurts.
29. As a user, I want to receive a Persistent Overrun Alert when a budget Flow has been on the wrong side of its plain limit for 3 consecutive periods, so that I notice a persistent pattern even when no single period was bad enough to breach Tolerance.
30. As a user, I want to set a Dry Floor for an Account, defaulting to $0, so that I'm warned before hitting an actual minimum I care about, not just zero.
31. As a user, I want to receive a Running-Dry Alert when an Account's projected balance is expected to cross below its Dry Floor within the Projection Horizon (default 90 days), so that I have time to react before it actually happens.
32. As a user, I want alerts to appear in-app, so that I see them without needing push notification support.

**Data ownership & portability**

33. As a user, I want all my financial data stored locally in my browser (IndexedDB) rather than on a server I don't control, so that I don't have to trust a third party with my full financial picture.
34. As a user, I want to export my data to a file, so that I have a backup independent of my browser's storage.
35. As a user, I want to import a previously exported file, so that I can restore my data or move it to a new browser/device.
36. As a user, I want my SimpleFIN credentials stored locally alongside the rest of my data, so that the app never needs its own backend to hold them.

## Implementation Decisions

- **Projection Engine** — the app's core seam. A pure, framework-free module: given Accounts, Flows (both kinds carrying an ordered Step Change / Recurring Rule timeline; recurring-kind additionally has a Cadence, budget-kind additionally has a Budget Period), Transfers, Tolerances, Dry Floors, the Projection Horizon, and synced Transactions, it computes (a) an Account's balance at an arbitrary date, (b) whether a Flow's period is within Tolerance (direction depending on kind/direction), (c) whether a budget-kind Flow has hit a Persistent Overrun Alert (3 consecutive periods over its plain limit), and (d) whether an Account will breach its Dry Floor within the Projection Horizon. No I/O of any kind — data in, computed values out. Everything else in the app is a thin adapter around it.
- **SimpleFIN Adapter** — thin HTTP client implementing the SimpleFIN protocol (token → Access URL claim, then Basic Auth per request). Confirmed via a live request that `beta-bridge.simplefin.org` returns `access-control-allow-origin`, `access-control-allow-credentials: true`, and `authorization` in `access-control-allow-headers` — direct browser calls work with no proxy.
- **Storage Repository** — IndexedDB-backed persistence for Accounts, Flows, Transfers, Step Changes, Recurring Rules, Categorization Rules, cached Transactions, and the SimpleFIN Access URL. Sits behind a repository interface; neither the Projection Engine nor the UI talk to IndexedDB directly.
- **Categorization module** — case-insensitive substring matching of a Transaction's description against Categorization Rules; longest-match-wins on overlap; exactly one rule per match text, overwritten in place on manual correction (no weighting, no coexisting competing rules for the same text).
- **Export/Import module** — serializes the full Storage Repository contents (including the SimpleFIN Access URL) to a downloadable file, and restores it on import. Per ADR-0002 this is the only backup mechanism — there is no cross-device sync.
- **Angular UI layer** — the stream-scrubbing timeline view per Account, Flow/Transfer editing forms, a review view for Transactions unmatched by any Categorization Rule, and in-app surfacing of Variance Alerts and Running-Dry Alerts. Built on Angular Signals so scrubbing a date recomputes only the derived values that depend on it (per ADR-0002).

**Schema sketch** (types, not file layout):

- `Account`: id, name, institution info (from SimpleFIN), current balance, current-balance synced-at timestamp.
- `Flow`: id, accountId, direction (`in`/`out`), kind (`recurring`/`budget`, fixed at creation), tolerance (`{ kind: 'percent' | 'fixed', value }`). Kind-specific fields:
  - `recurring`: cadence (`{ period: 'week' | 'month' | 'year', interval, anchors }` — anchors are day-of-week for `week`, day-of-month or nth-weekday-of-month for `month`, month-and-day for `year`), an ordered list of amount-changes — each either the initial amount, a Step Change (`{ effectiveDate, amount }`), or a Recurring Rule (`{ anniversaryDate, delta }`).
  - `budget`: period (`month`/`year`), an ordered list of amount-changes for the limit (same Step Change/Recurring Rule shape as recurring). No cadence, no rollover — the limit resets cleanly at each period boundary regardless of prior over/under-spend.
- `Transfer`: id, fromAccountId, toAccountId, the same ordered amount-change timeline shape as Flow.
- `CategorizationRule`: matchText, flowId.
- `Transaction`: id, accountId, date, amount, raw description, matchedFlowId (nullable).
- Global settings: per-Account Dry Floor, a single global Projection Horizon (default 90 days).

## Testing Decisions

- Good tests exercise the Projection Engine's external behavior (given this data, what balance/alert results) — not its internal helper functions.
- The Projection Engine is the module to test most heavily: nearly all the domain logic from this spec lives there — chronological Step Change / Recurring Rule application (either Flow kind), Transfer symmetry, Tolerance/Variance Alert evaluation (direction depending on kind/direction), Persistent Overrun Alert's 3-consecutive-period streak logic (budget-kind Flow only), Dry Floor/Running-Dry Alert evaluation within the Projection Horizon.
- The Categorization module (substring match, longest-match-wins, single-rule-per-text overwrite) should be tested as its own unit, independent of the Projection Engine.
- The SimpleFIN Adapter and Storage Repository are thin I/O wrappers — test against realistic fixture data/responses rather than exhaustively; correctness there is "did we call the right endpoint / write the right record," not business logic.
- This is a brand-new repo with no existing test conventions to follow as prior art — this spec's implementation sets the first pattern.

## Out of Scope

- Splitting a single physical Account into multiple virtual sub-accounts/envelopes — flows attach directly to real Accounts only.
- Cross-device sync of any kind — single device, manual export/import only (ADR-0002).
- Push notifications — alerts are in-app only (ADR-0002).
- Asymmetric Tolerance (a different-*magnitude* threshold for over vs. under) — still one flat Tolerance value per Flow for v1. (Not to be confused with a budget-kind Flow evaluating that one value in only one direction, mirroring its `direction` — that's a decided v1 behavior, not asymmetric thresholds.)
- A configurable streak length for Persistent Overrun Alert — fixed at 3 consecutive periods for v1, not a per-Budget setting.
- Fuzzy/similarity-based category suggestions for uncategorized Transactions — a plausible future feature, not part of this spec.
- Multi-currency support — not discussed during design; treat as unaddressed rather than assumed in scope.
- PWA installability, service worker, or offline support — a plain website, not an installed app (ADR-0002).

## Further Notes

- Two ADRs already exist in `docs/adr/` and should be respected: **ADR-0001** (anchor Account balance on the bank-reported current balance, not a summed transaction ledger) and **ADR-0002** (static, client-only Angular architecture — no backend, IndexedDB storage, GitHub Pages hosting).
- The Flows section, Alerts section, and Flow schema sketch above were corrected via the **Flow/Budget Split** wayfinder map (`.scratch/wayfinder/flow-budget-split/map.md`) — recurring and budget were originally conflated into one Flow shape; they're now two kinds of Flow with different scheduling and alerting. See the map for the full resolution history.
- **Open point**: whether Tolerance/Variance Alerts apply to Transfers the same way they do to Flows was not explicitly resolved during design — the interview established Transfers reuse Flow's *scheduling* mechanics (Step Changes/Recurring Rules) but didn't extend Tolerance to them explicitly. Worth a quick confirmation before or during implementation.
- **Open point**: the Projection Horizon (90 days) was decided as a single value; whether it should be configurable per Account rather than global wasn't discussed. Implement as one global default unless revisited.
