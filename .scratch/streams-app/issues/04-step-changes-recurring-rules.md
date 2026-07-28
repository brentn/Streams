# 04 — Step Changes and Recurring Rules on a Flow

**Migrated:** [brentn/Streams#13](https://github.com/brentn/Streams/issues/13) (open). This local file is historical; GitHub is now the source of truth.

**What to build:** The scheduling mechanics that let a Flow's amount change over time — a one-off manual Step Change, and an automated calendar-anchored Recurring Rule — composed as a single ordered timeline with no separate base amount to keep in sync.

**Scope note:** applies to a Flow of either kind — a recurring-kind Flow's expected amount or a budget-kind Flow's limit both carry the same Step Change/Recurring Rule timeline. (Earlier drafts of this note restricted it to recurring-kind only; that restriction was inherited by assumption from the Cadence scope decision rather than argued on its own merits, and was corrected on 2026-07-27 — see [brentn/Streams#13](https://github.com/brentn/Streams/issues/13).)

**Blocked by:** 02 — Flows drive the projection

**Status:** ready-for-agent

- [ ] User can add a Step Change to a Flow: a new amount, effective from a chosen date forward
- [ ] User can add a Recurring Rule to a Flow: an automated delta that fires every year on a chosen calendar date
- [ ] Step Changes and Recurring Rules apply in chronological order, each modifying whatever the Flow's amount currently is at that point in the timeline
- [ ] The Projection Engine reflects these scheduled changes correctly when projecting forward
