# 05 — Multi-account stream view: layout and synchronized scrubbing

**Type:** wayfinder:prototype
**Status:** closed
**Claimed by:** claude-session-2026-07-25
**Blocked by:** 01, 04, 06

## Question

Streams should show all connected accounts' streams together on one screen rather than switching between accounts one at a time, with scrubbing synchronized across all of them — decided in the 2026-07-25 grilling session that charted this map; no per-account switcher.

Decide the layout (stacked streams? side-by-side? a shared timeline with per-account balances?) and how synchronized scrubbing behaves across accounts, building on the single-stream design locked in ticket 04. Prototype (via `/prototype`) against fixture data for at least two accounts — extend ticket 01's seed data if it only covers one.

Note: today only one account is ever reachable (home redirects to the first stored account; there's no "connect a second account" flow built). This ticket designs the *view*, not the missing connect-another-account flow — building that flow, if needed, is implementation work for later, not part of this decisions-only map.

Record the decided layout and interaction model in `docs/ux-spec.md`.

## Resolution

**Decided: "shared timeline + chips," with a leading total stream.** Built three structurally different variants via `/prototype` (sub-shape B — no existing multi-account page to host them, so a new throwaway route `/prototype/multi-account-stream`, extending ticket 01's fixture with a second account, a credit card, per ticket 06):

- **A — Stacked timelines:** a full-size draggable chart per account, stacked.
- **B — Grid + shared slider:** a compact 2-column card grid with mini charts, one shared range input pinned at the bottom.
- **C — Shared timeline + chips:** one draggable timeline for the whole screen, one thin band per account.

User picked **C**, then iterated live to this final shape:

- **One shared calendar chip** (month + day), centered above the whole group — not per-account.
- **A "Total" stream leads the group**, above the individual account streams — a combined net-worth curve, in neutral ink rather than the accent green used for individual accounts, so it reads as the summary/hero element.
- **Each account's name** sits pinned above the left edge of its own stream (no separate name column or card header).
- **Balances render on the stream itself** at the scrub position (a small pill riding the crosshair), not as a separate chips row below.
- **Single shared drag-to-scrub surface** spanning the total stream and every account stream — dragging anywhere scrubs everything together, consistent with the map's standing "no per-account switcher" decision.
- **Sign handling, generalized across every stream (Total included):** thickness always tracks `|balance|` — it never zero-floors/flattens the way ticket 04's original single-account design did. Instead, only the portion of a stream where the balance is on the *opposite* of its account's expected side (checking overdrawn, credit card paid into credit, net worth negative) renders in a distinct brown, split as separate path segments so only that portion changes color — not the whole stream. The balance-pill number turns red in that same state. This is a **refinement discovered while resolving this ticket**, not decided in ticket 04 — ticket 04's account-stream page still uses the older flatten-on-crossing behavior, so the two screens are now inconsistent. Split out as ticket 08 to reconcile.

Recorded in `docs/ux-spec.md`. Prototype code lives in `src/app/features/multi-account-stream-prototype/` (route `/prototype/multi-account-stream`) — left in place, not folded into a production route, per this map's "decisions, not shipped UI" scope; wiring a real multi-account screen (and the still-missing connect-another-account flow) is implementation work for later.