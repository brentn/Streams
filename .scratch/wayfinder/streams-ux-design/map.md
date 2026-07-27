# Streams UX Design

**Label:** wayfinder:map
**Status:** closed — all 10 tickets resolved, no fog remaining. `docs/ux-spec.md` is the handoff artifact.
**Tracker:** migrated to GitHub as [brentn/Streams#24](https://github.com/brentn/Streams/issues/24) (2026-07-27), with tickets 01–10 as sub-issues [#25](https://github.com/brentn/Streams/issues/25)–[#34](https://github.com/brentn/Streams/issues/34) (note: ticket 06 is [#29](https://github.com/brentn/Streams/issues/29), created between tickets 04 and 05 to preserve dependency order — see #24's ticket list for the exact number-to-ticket mapping). This file remains as local reference; GitHub is the source of truth going forward.

## Destination

A locked UX design for Streams — cross-cutting visual language (color palette, typography, component-library choice, dark-mode approach) plus screen-level interaction design for the two existing screens (`connect-account`, `account-stream`) — written up as `docs/ux-spec.md`, ready to hand to an implementation session. Screens not yet built (Flows, Transfers, Step Changes, alerts, categorization — local issues 02–08) are out of scope.

This map produces decisions, not shipped UI — per wayfinder's default, "plan, don't do." The one exception is ticket 01, a task-type ticket that seeds dev-only fixture data so the app can actually be viewed; that's infrastructure for judging the decisions below, not part of the destination itself.

## Notes

- **Artifact:** decisions get consolidated into `docs/ux-spec.md` as they resolve (created on the first ticket that needs it), not left scattered across ticket resolutions — mirrors this repo's ADR precedent (`docs/adr/0001...`, `docs/adr/0002...`) for durable, hard-to-reverse calls.
- **Skills to consult:** `/prototype` for the prototype-type tickets (build the rough thing, react to it); `/grilling` + `/domain-modeling` for the grilling-type tickets; `/run` to launch the app for viewing; `dataviz` if any prototype involves an actual chart of the balance curve (tickets 04–05) — load it before writing chart code, it has palette/mark-spec guidance; `claude-in-chrome` if available, to drive the browser and screenshot prototypes.
- **Standing decision (2026-07-25 grilling):** no per-account switcher. All connected accounts are shown together and scrub in sync — see ticket 05.

## Decisions so far

- [01 — Fixture data + view the app live](tickets/01-fixture-data-and-view-the-app.md) — Seeded one dev-only fixture account with ~120 days of transactions; human viewed both screens live. App renders and functions but reads as plainly unstyled, confirming (not changing) the premise of tickets 02–04. Ticket 05 still needs a second fixture account.
- [02 — Component library vs. hand-rolled CSS](tickets/02-component-library-or-hand-rolled-css.md) — Hybrid: Angular CDK (headless) for generic chrome behavior styled with hand-rolled CSS, scrubber/stream always fully custom. No ADR amendment needed; recorded in `docs/ux-spec.md`.
- [03 — Visual language: palette, typography, dark mode](tickets/03-visual-language.md) — Sage-green accent (dark `#00D639` / light `#00A63E`, dataviz-validated) on dataviz's neutral tokens, system sans + tabular-nums, OS-driven dark mode only. Surfaced a strong scrubber-redesign candidate (thickness-encoded balance, drag-to-scrub) carried forward to ticket 04, not decided here.
- [04 — Scrubber redesign: chart vs. range input](tickets/04-scrubber-redesign.md) — Chart wins: thickness-encoded balance band with drag-to-scrub (variant D), confirmed live against a same-visual-language plain-range-input alternative. Surfaced a new domain-model gap (no expected-sign/account-type field exists anywhere in the app) sharp enough to ticket — see ticket 06.
- [06 — Account expected-sign field: source and defaults](tickets/06-account-expected-sign.md) — `Account` gets `expectedSign: 1 | -1`, user-set via a new per-account connect-flow step (not inferred, not hardcoded). Ticket 01's fixture stays `+1`; ticket 05's second fixture becomes a credit card at `-1`. Surfaced a new in-scope UI question (the connect-flow step itself) — see ticket 07.
- [05 — Multi-account stream view: layout and synchronized scrubbing](tickets/05-multi-account-stream-view.md) — "Shared timeline + chips": one shared calendar chip and drag surface for the whole group, a neutral-ink "Total" stream leading the individual accent-green account streams, balances riding the streams themselves rather than separate chips. Generalized ticket 04's sign handling to never flatten (thickness tracks `|balance|`, only the opposite-sign portion of each stream turns brown) — surfaced an inconsistency with ticket 04's original single-account page, split out as ticket 08.
- [07 — Connect-flow step: setting an account's expected sign](tickets/07-connect-flow-expected-sign-ui.md) — "List + toggle": one screen listing every returned account with a plain Asset/Liability toggle per row (not a paginated wizard, not a richer account-type selector). Nothing saves until every row is chosen.
- [08 — Reconcile sign handling between account-stream and the multi-account view](tickets/08-reconcile-sign-handling.md) — `account-stream` adopts the multi-account view's never-flatten/brown-segment treatment (no single-account-specific reason to keep flat-line), but the segmentation logic is reimplemented fresh rather than promoting the throwaway `segmented-band.ts` as-is — a code-cleanliness call, not a functional one.
- [09 — Responsive/mobile layout for the multi-account view](tickets/09-responsive-mobile-layout.md) — "Shrink in place" wins outright over two alternatives (pinned-Total + swipe carousel; fixed balance panel): same structure, pill treatment, and drag gesture as desktop, just shorter lanes. Surfaced a real global fix — the app shell's `main` padding was over-inseting every page at narrow widths, now zeroed below 480px via media query.
- [10 — Error / loading-state visual treatment](tickets/10-error-loading-state-polish.md) — Inline banner wins outright over a toast overlay and a header-integrated status strip: a persistent alert box with its own Retry button between header and content, plus a progress bar under the header while syncing. Same pattern applies to `connect-account`'s connect-failure state once that page gets its own visual-language pass (not separately demoed — the page isn't sage-styled yet).

## Not yet specified

<!-- empty — the one item here (error/loading-state polish) graduated to ticket 10 once ticket 02 settled its dependency (CDK is headless, so a custom treatment is needed regardless) -->

## Out of scope

- UX design for screens not yet built (local issues 02–08: Flows, Transfers, Step Changes, Categorization Rules, Running-Dry Alerts, Variance Alerts). Each gets its own UX pass when it's actually built.
