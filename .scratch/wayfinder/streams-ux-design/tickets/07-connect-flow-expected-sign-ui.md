# 07 — Connect-flow step: setting an account's expected sign

**Type:** wayfinder:prototype
**Status:** closed
**Claimed by:** claude-session-2026-07-25
**Blocked by:** none

## Question

Ticket 06 decided `Account.expectedSign` is user-set, via a new per-account confirmation step added to the `connect-account` flow — not inferred, not hardcoded. That screen doesn't exist yet: `connect-account` today is a single step (paste a SimpleFIN setup token, every returned account imports automatically, straight to the first account's detail page) with no per-account confirmation UI at all.

Design that step. Open questions to resolve here:

- Where it sits in the flow: a screen per returned account (one at a time), or one screen listing all returned accounts with a control per row?
- What the control looks like: a two-way toggle (asset/liability), or something that surfaces the actual account type (checking/savings/credit card) even though only the derived sign is stored today?
- What happens if the user skips or the flow is abandoned partway — does a sensible default (e.g. positive-balance-implies-asset) apply so the account isn't left in a broken state, or does the account simply not save until confirmed?

Use `/prototype` (UI branch — "what should it look like") against the existing `connect-account` screen (sub-shape A: adjustment to an existing page, per this map's ticket-03/04 convention), styled with the sage visual language locked in ticket 03. Record the decided flow and screen design in `docs/ux-spec.md`.

## Resolution

**Decided: "List + toggle" (variant A).** All three open questions resolved together:

- **Where it sits:** one screen listing every returned account, not a paginated per-account wizard — faster to get through for the common 1-2 account case, and lets the user see everything at once before committing.
- **The control:** a plain two-way Asset/Liability toggle per row — not the richer checking/savings/credit-card selector prototyped as variant B. The richer type selector added a step of translation (user picks a type, sign gets derived) for no visible benefit today, since only the derived sign is stored (per ticket 06); a type enum can be introduced later if a real second consumer needs it, and the toggle can be swapped for a type-selector then without disturbing this screen's structure.
- **Abandoning the flow:** nothing saves until every row has a choice and "Save & continue" is pressed — no default, no partial save. Matches ticket 06's decision against inferring/defaulting the sign.

Built 3 structurally different variants via `/prototype` (sub-shape A, on the existing `/connect` route, `?variant=`): **A — List + toggle** (winner), **B — Wizard** (one account at a time, richer type question), **C — Inline** (no separate screen, form stays visible with compact cards below). Reacted to all three live against two fake fixture accounts (a checking account and a credit card — the prototype bypasses the real SimpleFIN network round-trip entirely so it's usable without a live token). Prototype code lives in `src/app/features/connect-account/prototype-expected-sign/`, wired into `connect-account.ts`/`.html` behind a dev-only `?variant=` gate that leaves the default (no-variant) flow byte-for-byte the original behavior — confirmed via the existing `connect-account.spec.ts` suite, unchanged and passing.

Recorded in `docs/ux-spec.md`. Left in place per this map's "decisions, not shipped UI" scope — folding the winning variant into the real `connect-account` component (and actually wiring `Account.expectedSign` through storage) is implementation work for later.