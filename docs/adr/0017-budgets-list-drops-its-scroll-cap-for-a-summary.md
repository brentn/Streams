# Budgets list drops its scroll cap in favor of an always-visible summary

#103 asked the Budgets list to show every budget-kind Flow at once, with no internal scrollbar, plus a summary above the rows answering "how much of my total spending-budget allocation have I used?" and "is that total more than I actually make?"

This supersedes the second sentence of ADR-0010's Consequences ("Both the uncategorized-transactions list and the new Budgets list also gained a max-height + scroll cap") as it applies to the Budgets list specifically: `.budget-rows`' `max-height: var(--list-max-height)` + `overflow-y: auto` is removed. The tradeoff ADR-0010 accepted that cap for — keeping an unbounded list from pushing the "Add Flow"/"Add Transfer" buttons down the page — is deliberately re-accepted in the other direction: those buttons may now sit lower on an account with many budgets, in exchange for every budget being visible without scrolling within a small pane. The uncategorized-transactions list (`transaction-review.css`) keeps its own cap untouched; nothing about its rationale changed.

The new summary sits above the per-row list, inside the same `BudgetList` component (`budget-list.ts`/`.html`/`.css`), rendered from two new pure functions living alongside `budgetProgress`/`budgetProgressStatus` in `projection-engine.ts`:

- `aggregateBudgetProgress(flows, transactions, today)` sums `used`/`limit` across every `direction: 'out'` budget-kind Flow, calling each Flow's own `budgetProgress` rather than re-deriving it. A year-period Budget's `used` and `limit` are both prorated by `1/12` before summing, so a once-a-year expense contributes its monthly-equivalent share to the combined total instead of distorting it. `direction: 'in'` budgets are excluded from the total (they have no "spent against" story to fold in) but keep rendering as ordinary rows below, unchanged.
- `averageMonthlyIncome(transactions, asOf, windowMonths)` sums every non-transfer-matched Transaction with a non-negative amount over the trailing `windowMonths` (fixed at 3) back from `asOf`, divided by however much of that window the account's transaction history actually spans (capped at `windowMonths`) rather than a flat divisor — a new account with less history still gets a genuine average instead of an artificially low one.

The summary's progress bar reuses the per-row bar's visual pattern (`.progress-track`/`.progress-fill`, capped-fill-with-uncapped-text) but colors against a flat 90%/100% threshold on the aggregate ratio, not any per-budget Tolerance — there's no coherent way to combine several Budgets' individual Tolerance bands into one aggregate band. This is a third reading of progress-bar coloring alongside `budgetProgressStatus`'s symmetric per-row Tolerance band (ADR-0011) and `varianceAlert`'s single-directional completed-period breach.

## Consequences

- `BudgetList`'s summary block and the per-row list both still follow `selectedDate` (ADR-0011) — `aggregateBudgetProgress` and `averageMonthlyIncome` both take `today`/`asOf` from the same scrub position, so scrubbing the stream updates the total, the bar, and the income figure together with the rows beneath them.
- An account with many budgets can now push the "Add Flow"/"Add Transfer" buttons arbitrarily far down the page. Accepted, not mitigated, per #103.
- `aggregateBudgetProgress`/`averageMonthlyIncome` are scoped to the account currently being viewed, matching every other calculation in `projection-engine.ts` — no cross-account aggregation.
