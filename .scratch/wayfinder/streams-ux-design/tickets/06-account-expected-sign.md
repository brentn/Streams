# 06 — Account expected-sign field: source and defaults

**Type:** wayfinder:grilling
**Status:** closed
**Claimed by:** claude-session-2026-07-25
**Blocked by:** none

## Question

Ticket 04 locked the `account-stream` scrubber as a thickness-encoded chart, zero-floored per the account's expected sign (asset vs. liability) — flat when a checking account goes overdrawn, or a credit card's balance crosses into credit. Neither the `Account` model (`src/app/core/models/account.ts`) nor the raw SimpleFIN API response the adapter parses (`SimpleFinAccount` in `src/app/core/simplefin/simplefin-adapter.ts`) currently carries any field indicating this — confirmed while resolving ticket 04, not assumed.

Decide:
- What field to add to `Account` (a boolean like `isLiability`, a signed literal like `expectedSign: 1 | -1`, or a richer `type` enum — `checking` | `savings` | `credit-card` — that a sign can be derived from), and its exact shape.
- Where the value comes from: SimpleFIN doesn't expose an account-type field in this app's parsed shape, so it can't just be mapped through — does it get inferred (e.g. from the account's typical balance sign at connect time), or does the user set it explicitly somewhere in the connect flow?
- Whether this needs a default for the existing single fixture account (ticket 01) and, if ticket 05's second fixture account is a credit card, whether that's exactly where this gets exercised for real.

Use `/domain-modeling` and `/grilling` to pin this down.

## Resolution

Grilled via `/grilling`. Three decisions:

1. **Field:** `Account` gets `expectedSign: 1 | -1` — a signed literal, not a boolean or a richer type enum. Matches exactly what `curveToBand` (the ticket-04 chart prototype) already consumes with zero translation. Rejected the richer `type: 'checking' | 'savings' | 'credit-card'` enum for now — YAGNI, since the chart is the only consumer that exists today and a type enum is easy to add later (deriving `expectedSign` from it) the moment a second consumer shows up.
2. **Source:** user-set, via a new per-account confirmation step added to the `connect-account` flow — not inferred from balance sign at connect time (a single balance snapshot can't reliably distinguish account types; an overdrawn checking account would misclassify as a liability) and not hardcoded/punted. Confirmed while researching this ticket: `connect-account`'s flow today is a single step (paste a SimpleFIN token → every returned account is imported automatically, straight to the first account's detail page) with no per-account confirmation screen, and SimpleFIN exposes no account-type field this app's adapter maps — so the new step is genuinely new UI, not a rewire of an existing one. Since `connect-account` is already one of this map's two in-scope screens (per the Destination) but hasn't had a UX pass yet, this is a real follow-on decision — split out as ticket 07 (prototype-type: "what should this per-account step look like").
3. **Fixtures:** ticket 01's existing checking-account fixture keeps `expectedSign: 1` (set directly in the seed script, no UI involved — fixtures are seeded data, not exercised through the real connect flow). Ticket 05's second fixture account will be a credit card with `expectedSign: -1`, so ticket 05 actually exercises the liability path with real data rather than two checking accounts that never test it.

Recorded in `docs/ux-spec.md`. The `Account` model itself is not changed by this ticket — adding the real field, and building the connect-flow UI, is implementation work for the session this map hands off to (per the map's "decisions, not shipped UI" scope); this ticket fixes what the decision is, not when it's built.