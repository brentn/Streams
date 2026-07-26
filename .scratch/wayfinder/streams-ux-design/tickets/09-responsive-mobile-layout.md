# 09 — Responsive / mobile layout for the multi-account view

**Type:** wayfinder:prototype
**Status:** closed
**Claimed by:** claude-session-2026-07-25
**Blocked by:** none

## Question

Ticket 05 locked the desktop multi-account layout: one shared calendar chip and drag surface spanning a neutral-ink "Total" stream (leading the group) plus one accent-green stream per account, each ~130px tall (`NAME_ROW_HEIGHT` + `CHART_ROW_HEIGHT` from `src/app/features/multi-account-stream-prototype/variant-c-shared-timeline.ts`) with balances riding the streams themselves.

Decide how this collapses at narrow (phone-width) viewports:

- Do the stacked streams stay full-width and simply get shorter/narrower, or does the layout change shape entirely (e.g. Total stays pinned while individual accounts become swipeable/scrollable rather than all stacked at once)?
- Does the balance-pill-on-the-stream treatment stay legible at narrow widths, or does it need a different presentation there (e.g. move to a fixed position rather than riding the crosshair)?
- Does the single shared drag-to-scrub interaction still work well with touch on a narrow viewport, or does anything about the gesture need to change?

Use `/prototype` (UI branch) against the existing multi-account prototype route (`/prototype/multi-account-stream`, `src/app/features/multi-account-stream-prototype/`) at phone-width viewport sizes.

## Resolution

Built three phone-width variants of the desktop-winning "shared timeline + chips" layout (ticket 05), reacted to live via the `/prototype/multi-account-stream` route's `m1`/`m2`/`m3` switcher keys:

- **`m1` — Shrink in place**: same structure and gesture as desktop, just smaller (shorter lanes, tighter calendar chip).
- **`m2` — Pinned Total + swipe**: Total fixed at top; individual accounts become a one-at-a-time horizontal carousel (native scroll-snap swipe + dots).
- **`m3` — Fixed balance panel**: lanes stay stacked like `m1`, but balances move off the bands into a pinned, horizontally-scrollable chip row.

**`m1` wins outright** — no interest in `m2` or `m3`. Answering the three open questions:

1. **Layout shape:** stays stacked full-width, just shorter/narrower. No restructuring into a pinned-total/swipeable-carousel shape, no different shape at all.
2. **Balance-pill-on-the-stream treatment:** stays legible as-is at narrow widths — no need for a separate fixed-position balance panel.
3. **Drag-to-scrub gesture:** the single shared drag surface works fine at narrow/touch widths, unchanged from desktop.

One real (non-prototype) fix surfaced along the way: the app shell's `main` element (`src/app/app.css`) carried a fixed `1.5rem` horizontal padding that, stacked with `m1`'s own page padding, made the narrow layout feel over-inset. Fixed with a `max-width: 480px` media query zeroing `main`'s left/right padding only below that breakpoint (vertical padding and all wider-viewport layout untouched) — a genuine global responsive fix, not scoped to this prototype, since `account-stream` and `connect-account` benefit from it too.

`m2` and `m3` are kept in `multi-account-stream-prototype/` as rejected alternatives, same convention as tickets 04/05's rejected variants — not deleted.

