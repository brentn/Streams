# 05 — Transaction categorization — automatic and manual

**Migrated:** [brentn/Streams#14](https://github.com/brentn/Streams/issues/14) (open). This local file is historical; GitHub is now the source of truth.

**What to build:** Synced Transactions map to a Flow automatically via Categorization Rules, with manual correction that keeps the rule set current going forward.

**Blocked by:** 02 — Flows drive the projection

**Status:** ready-for-agent

- [ ] Synced Transactions automatically match to a Flow via a case-insensitive substring Categorization Rule on their description
- [ ] When multiple Categorization Rules match the same Transaction, the longest (most specific) match wins
- [ ] User can manually assign or correct a Transaction's Flow
- [ ] A manual correction overwrites the Categorization Rule for that merchant text in place, so future Transactions from the same merchant auto-categorize correctly
- [ ] Transactions that match no Categorization Rule are surfaced for manual assignment
