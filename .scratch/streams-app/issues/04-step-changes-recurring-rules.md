# 04 — Step Changes and Recurring Rules on a Flow

**What to build:** The scheduling mechanics that let a Flow's amount change over time — a one-off manual Step Change, and an automated calendar-anchored Recurring Rule — composed as a single ordered timeline with no separate base amount to keep in sync.

**Scope note:** applies only to recurring-kind Flow. A budget-kind Flow has no amount-change timeline — its limit is a flat value for its period, no Step Changes or Recurring Rules apply to it. See the **Flow/Budget Split** wayfinder map (`.scratch/wayfinder/flow-budget-split/map.md`, ticket 03).

**Blocked by:** 02 — Flows drive the projection

**Status:** ready-for-agent

- [ ] User can add a Step Change to a Flow: a new amount, effective from a chosen date forward
- [ ] User can add a Recurring Rule to a Flow: an automated delta that fires every year on a chosen calendar date
- [ ] Step Changes and Recurring Rules apply in chronological order, each modifying whatever the Flow's amount currently is at that point in the timeline
- [ ] The Projection Engine reflects these scheduled changes correctly when projecting forward
