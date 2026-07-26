# 04 — Scrubber redesign: chart vs. range input

**Type:** wayfinder:prototype
**Status:** closed
**Claimed by:** claude-session-2026-07-25
**Blocked by:** 01, 03

## Question

Decide whether the `account-stream` scrubber becomes a graphical timeline/chart of the balance curve (with the actual/projected boundary visually marked) or stays a plain `<input type="range">`, per the product spec's "stream you scroll through time" framing. Current implementation is a plain range input bounded to −365..+180 days from today (an arbitrary UI choice made during the walking-skeleton build, not a spec requirement) plus prev/next-day buttons.

Use `/prototype` to build a rough version of each direction against real fixture data (ticket 01) and the visual language locked in ticket 03, and react to both live rather than deciding on description alone. If a chart direction is chosen, consult the `dataviz` skill for palette/mark-spec guidance before prototyping it.

**Carried forward from ticket 03** (surfaced while reacting to that ticket's palette prototype, not decided there — a strong candidate worth starting from rather than a settled answer):

- **Encoding:** balance as line *thickness* around a flat centerline rather than vertical position — zero-floored per the account's expected sign (flat when a checking account goes overdrawn, or a credit card's balance crosses into credit), inside a panning ~6-month window centered on the scrub position.
- **Interaction:** direct drag-to-scrub on the timeline itself (pointer/touch drag, relative-pixel-delta mapped to days so it stays stable as the window re-centers) — no separate range input or prev/next buttons.
- **Marker:** a calendar-day chip (month band + day number) tied to the scrub position, joined to the balance figure by a vertical accent-colored line running through the chart, in a fixed vertical rhythm (calendar → chart → balance) rather than the marker following the curve's data position.
- **New domain-model gap this surfaced:** `Account` has no field recording which sign it normally expects (asset vs. liability) — needed to zero-floor the thickness encoding correctly. Something this ticket needs to either resolve (add the field) or design around.
- **Prototype code:** `src/app/features/account-stream/prototype-visual-language/` — variant D ("Sage band"), switchable via `?variant=d` on the existing `/accounts/:id` route, dev-only (gated on `isDevMode()`). Left in place rather than thrown away since no winner was chosen yet; extend or replace it here rather than starting fresh.

## Resolution

**Decided: the chart direction wins.** The `account-stream` scrubber becomes the thickness-band timeline (variant D), not a plain range input.

Built two variants holding ticket 03's sage visual language constant so only the scrubber mechanism varied:
- **Variant D — Sage band:** balance as line thickness around a flat centerline, zero-floored per account sign, drag-to-scrub directly on the timeline, calendar-day chip joined to the balance figure by a vertical accent line, ~6-month panning window. Already largely built from ticket 03's carry-forward sketch (`variant-d-sage-band.ts`/`.html`/`.css`); no changes needed beyond what ticket 03 had already sketched.
- **Variant E — Sage range** (new for this ticket): the same header/card/balance/date layout as variant D, but with a plain `<input type="range">` plus prev/next-day buttons, restyled with the same sage tokens. Built purely as the comparison's control — isolates the scrubber mechanism as the only variable. (`variant-e-sage-range.ts`/`.html`/`.css`.)

Reacted to both live against the fixture account (ticket 01); user picked variant D.

**Domain-model gap, not resolved here:** variant D needs to know each account's expected sign (asset vs. liability) to zero-floor the thickness encoding correctly. Confirmed while resolving this ticket: neither the current `Account` model (`src/app/core/models/account.ts`) nor the raw SimpleFIN API response the adapter parses (`SimpleFinAccount` in `simplefin-adapter.ts`) carries any type/asset-liability classifier — there's no field to map, the app has never modeled this. The prototype hardcodes `expectedSign = 1` (asset), correct only for the single checking fixture. This is a real decision (what field, what values, inferred vs. user-set) too specific to bundle into this ticket's "which scrubber" question — split out as ticket 06.

Recorded in `docs/ux-spec.md`.