# 08 — Variance Alerts

**Migrated:** [brentn/Streams#17](https://github.com/brentn/Streams/issues/17) (open). This local file is historical; GitHub is now the source of truth.

**What to build:** In-app warning when a Flow's actual spending drifts too far from what was expected.

**Blocked by:** 05 — Transaction categorization — automatic and manual

**Status:** ready-for-agent

- [ ] User can set a Tolerance on a Flow, as either a percentage or a fixed dollar amount
- [ ] The Projection Engine compares a completed period's actual categorized total for a Flow against its expected amount
- [ ] A Variance Alert is raised in-app when the actual total falls outside the Flow's Tolerance in either direction
- [ ] Tolerance is applied symmetrically — the same threshold above and below the expected amount
