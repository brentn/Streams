# 06 — Running-Dry Alerts

**What to build:** In-app warning when an Account is projected to cross below its Dry Floor within the Projection Horizon.

**Blocked by:** 02 — Flows drive the projection

**Status:** ready-for-agent

- [ ] User can set a Dry Floor on an Account, defaulting to $0
- [ ] The Projection Engine evaluates the Account's forward projection against its Dry Floor within the 90-day Projection Horizon
- [ ] A Running-Dry Alert is raised in-app when the projection is expected to cross below the Dry Floor within that horizon
- [ ] The alert updates automatically as new Transactions sync and the projection shifts
