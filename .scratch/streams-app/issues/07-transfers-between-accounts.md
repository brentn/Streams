# 07 — Transfers between two Accounts

**Migrated:** [brentn/Streams#16](https://github.com/brentn/Streams/issues/16) (open). This local file is historical; GitHub is now the source of truth.

**What to build:** A Transfer entity that moves money between two of the user's own Accounts without being mis-modeled as two unrelated Flows, reusing the Step Change / Recurring Rule scheduling built for Flows.

**Blocked by:** 04 — Step Changes and Recurring Rules on a Flow

**Status:** ready-for-agent

- [ ] User can create a Transfer between two of their own Accounts
- [ ] A Transfer is scheduled using the same Step Change / Recurring Rule mechanics as a Flow
- [ ] A Transfer applies symmetrically: the same amount decreases the from-Account's projection and increases the to-Account's projection at the same time
- [ ] Editing a Transfer's schedule updates both Accounts' projections consistently — they never drift out of sync
