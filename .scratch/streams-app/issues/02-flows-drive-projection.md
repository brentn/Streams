# 02 — Flows drive the projection

**What to build:** Flows attached to an Account so the forward projection reflects expected income/expenses instead of a flat line. Every Flow is one of two kinds, fixed at creation — recurring (date/frequency-known) or budget (a period spending/income limit) — see the **Flow/Budget Split** wayfinder map (`.scratch/wayfinder/flow-budget-split/map.md`) and the updated `CONTEXT.md` Flow entry for the full domain model.

**Blocked by:** 01 — Connect a bank Account via SimpleFIN and scroll its stream

**Status:** ready-for-agent

- [ ] User can create a Flow on an Account with a direction (in/out), a kind (recurring or budget, fixed thereafter), and a starting amount
- [ ] For a recurring-kind Flow: user sets a cadence (`{ period: week/month/year, interval, anchors }`, e.g. weekly, biweekly, monthly, bi-monthly, semi-monthly, annually, semi-annually, or an "Nth weekday of month" pattern)
- [ ] For a budget-kind Flow: user sets a period (month or year) and a limit; no cadence, no rollover — the limit resets cleanly each period
- [ ] User can edit or delete an existing Flow
- [ ] The Projection Engine includes all of an Account's active Flows when computing its forward-projected balance
- [ ] Scrolling an Account's stream forward reflects each recurring-kind Flow's expected recurrences at its cadence, and each budget-kind Flow's expected amount for its period
