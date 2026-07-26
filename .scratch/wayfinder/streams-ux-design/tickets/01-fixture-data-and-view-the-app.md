# 01 — Fixture data + view the app live

**Type:** wayfinder:task
**Status:** closed
**Claimed by:** claude-code session (2026-07-25)
**Blocked by:** none

## Question

Get the current Streams app viewable end-to-end without a real SimpleFIN connection, then actually look at it — nobody has seen this rendered yet.

- Seed IndexedDB with plausible fixture data: at least one Account plus enough Transactions to produce a non-trivial balance history, via a temporary dev-only mechanism (a seed script run through the browser console, or a temporary dev-only seed button/route). For ticket 05 (multi-account view), fixture data for at least two accounts will eventually be needed — either do that here or note it as follow-up work for ticket 05 to extend.
- Start the dev server (`npm start`) and view both `/connect` and `/accounts/:id`.

This ticket blocks every other ticket on this map — none of the design decisions below should be judged against unrendered HTML. If `claude-in-chrome` is connected, use it to drive the browser and capture screenshots as a reference for later tickets; if not (it was declined in a prior session — don't re-prompt if declined again), the human looks at it live instead.

## Resolution

Built a dev-only fixture seed script (`.scratch/wayfinder/streams-ux-design/seed-fixture-data.js`, browser-console-pasteable, not part of `src/`): one account (`fixture-checking`, "Everyday Checking") with ~120 days of synthetic transaction history (paychecks, rent, utilities, groceries, discretionary spend), current balance $2,415.32. Only one account seeded — ticket 05 will need to extend this to at least two.

Started `npm start` and the human viewed `/connect` and `/accounts/fixture-checking` live (no browser-driving tool available in this session — declined previously, not re-prompted).

Verdict: renders and functions, but reads as plainly unstyled — confirms the premise of tickets 02–04 (component library, visual language, scrubber) rather than surfacing anything new. No blockers found for those tickets.

