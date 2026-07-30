# Streams UX Spec

Decisions from the [streams-ux-design wayfinder map](../.scratch/wayfinder/streams-ux-design/map.md), consolidated here as they resolve. Ready to hand to an implementation session once the map is done.

## Component library: Angular CDK, headless

Streams uses **Angular CDK** for generic chrome behavior — dialogs, menus, listboxes/comboboxes, overlay and focus-trap accessibility — styled entirely with hand-rolled CSS on top. No visual component library (Angular Material, Bootstrap, etc.) is adopted.

- **Scope:** applies to generic chrome (forms, buttons, dialogs, nav) across all screens, including the 7 not yet built (Flows, Transfers, Step Changes, Categorization Rules, Running-Dry Alerts, Variance Alerts, Export/Import).
- **Exception:** the scrubber and the balance-stream timeline are always fully custom, regardless of this decision — no library, headless or otherwise, supplies the product's distinctive "stream you scroll through time" visual identity out of the box.
- **CDK vs. a headless kit:** Angular CDK alone for now (first-party, ships with Angular, covers overlay/dialog/menu/listbox/combobox/a11y). A third-party headless kit (e.g. Spartan/ng-primitives) is added only if a specific future screen surfaces a pattern CDK doesn't cover — not adopted preemptively.
- **Why headless over a full library (Material/Bootstrap):** a full library ships its own visual identity that would need active, ongoing override to avoid fighting the product's distinctive framing — especially risky for the scrubber and multi-account stream view. Headless CDK gives behavior and accessibility for free with zero visual opinion, so the palette/typography work (ticket 03) isn't fighting a default look.
- **ADR fit:** Angular CDK is tree-shakeable and ships no default styles, so it comfortably fits [ADR 0002](adr/0002-static-client-only-architecture.md)'s "minimal footprint" intent — no amendment needed. This decision lives here, not as a new ADR, since it's consistent with ADR 0002 rather than a change to it.
- **Dark mode consequence:** CDK supplies no dark-mode tokens or theming. Dark mode is fully defined by ticket 03's custom design tokens, not inherited from a library.

## Visual language: palette, typography, dark mode

**Palette.** Neutral tokens (surfaces, ink primary/secondary/muted, gridlines, borders) come from the `dataviz` skill's reference palette, declared as CSS custom properties for both light and dark explicitly — dual declaration, not an automatic invert of one set. Accent is Sage's brand green (Pantone 2271 C):

| Token             | Light                               | Dark                               |
| ----------------- | ----------------------------------- | ---------------------------------- |
| Accent            | `#00A63E` (3.14:1 vs light surface) | `#00D639` (8.86:1 vs dark surface) |
| Page              | `#f9f9f7`                           | `#0d0d0d`                          |
| Surface           | `#fcfcfb`                           | `#1a1a19`                          |
| Ink primary       | `#0b0b0b`                           | `#ffffff`                          |
| Ink secondary     | `#52514e`                           | `#c3c2b7`                          |
| Ink muted         | `#898781`                           | `#898781`                          |
| Gridline          | `#e1e0d9`                           | `#2c2c2a`                          |
| Border (hairline) | `rgba(11,11,11,0.10)`               | `rgba(255,255,255,0.10)`           |

The accent steps rather than reusing one hex in both modes: raw brand green `#00D639` only reaches 1.92:1 on the light surface (below the `dataviz` validator's 3:1 floor), so light mode uses `#00A63E` instead — same hue family (OKLCH H≈147° vs the brand's 144.8°), computed via the validator rather than eyeballed. Status colors (good/warning/serious/critical) stay `dataviz`'s reserved set, distinct from this accent.

**Typography.** System sans throughout — `system-ui, -apple-system, "Segoe UI", sans-serif` — no display or serif face anywhere, matching ADR 0002's minimal-footprint intent. Tabular-nums (`font-variant-numeric: tabular-nums`) for the balance figure and other aligned numeric columns. Type scale:

| Role                           | Size / weight                   |
| ------------------------------ | ------------------------------- |
| Eyebrow label                  | `0.75rem`, uppercase, muted ink |
| Heading (account name)         | `1.25rem` / 600                 |
| Body / institution             | `0.875rem`                      |
| Hero balance (card-bound)      | `2.5rem` / 700                  |
| Hero balance (inline, no card) | `1.4rem` / 700                  |

**Dark mode.** OS-driven only (`prefers-color-scheme`) — no in-app manual toggle. Simplest option that matches ADR 0002's minimal-footprint intent: no toggle UI to build, no theme preference to persist.

**Base layout language.** A light-first bordered card (eyebrow label → hero figure → supporting text), confirmed live against fixture data against three alternatives (a dark-first full-bleed hero, a chart-less editorial/typographic treatment, and a green-accented chart exploration). See [ticket 03](../.scratch/wayfinder/streams-ux-design/tickets/03-visual-language.md) for the full resolution, including a strong candidate direction for the account-stream scrubber itself (thickness-encoded balance, drag-to-scrub) carried forward to ticket 04 rather than decided here.

## Scrubber: chart, not a range input

The `account-stream` scrubber is a graphical timeline, not a plain `<input type="range">` — balance encoded as **line thickness** around a flat centerline (not vertical position), zero-floored per the account's expected sign, inside a panning ~2-month window centered on the scrub position (narrowed from an original ~6-month window once the account-stream tributary lines made the wider window feel crowded):

- **Interaction:** direct drag-to-scrub on the timeline itself (pointer/touch drag mapped to days) — no separate range input or prev/next buttons.
- **Marker:** a calendar-day chip (month band + day number (plus year if not current year)) tied to the scrub position, joined to the balance figure by a vertical accent-colored line, in a fixed vertical rhythm (calendar → chart → balance) rather than following the curve's data position.
- **Actual vs. projected:** the projected portion of the band renders at reduced opacity with a dashed outline, distinguishing it from the actual (solid) portion.

Confirmed live against a plain-range-input alternative restyled with the same visual language (ticket 03), so the comparison isolated the scrubber mechanism alone. See [ticket 04](../.scratch/wayfinder/streams-ux-design/tickets/04-scrubber-redesign.md) for the full resolution.

**Open dependency:** the thickness encoding needs each account's expected sign (asset vs. liability) to zero-floor correctly. Neither the `Account` model nor the SimpleFIN data the app parses currently carries this — tracked as [ticket 06](../.scratch/wayfinder/streams-ux-design/tickets/06-account-expected-sign.md).

**Superseded by ticket 05, reconciled by ticket 08:** the "zero-floored" sign handling described above (flat when crossing to the opposite side) was the original single-account design. Resolving the multi-account view (ticket 05) generalized this to never flatten — see "Sign handling: never flatten, color the opposite-sign portion" below — and [ticket 08](../.scratch/wayfinder/streams-ux-design/tickets/08-reconcile-sign-handling.md) confirmed `account-stream` should be updated to match, for the same reason it won for the group view: a flat line hides *how far* overdrawn something is. No single-account-specific reason surfaced to keep the old flat-line treatment.

## Account model: expected-sign field

`Account` gains an `expectedSign: 1 | -1` field — a signed literal, not a boolean or a richer account-type enum, since the chart's zero-flooring math is the only consumer today and a type enum can be added later if a second consumer needs it.

- **Source:** user-set, via a new per-account confirmation step in the `connect-account` flow — not inferred from the account's balance sign at connect time (unreliable: an overdrawn checking account would misclassify as a liability) and not defaulted/hardcoded. SimpleFIN exposes no account-type field this app's adapter maps, so there's no source data to infer from even if inference were desired. `connect-account` today is a single step (paste a token, every returned account imports automatically) with no per-account screen — this is new UI. See [ticket 07](../.scratch/wayfinder/streams-ux-design/tickets/07-connect-flow-expected-sign-ui.md) for that screen's design.
- **Fixtures:** the ticket-01 checking account is `expectedSign: 1`; ticket 05's second fixture account is a credit card at `expectedSign: -1`.

See [ticket 06](../.scratch/wayfinder/streams-ux-design/tickets/06-account-expected-sign.md) for the full resolution.

## Connect flow: per-account sign confirmation

After a successful SimpleFIN connect, before navigating to any account, the user sees **one screen listing every returned account**, each with a plain **Asset / Liability toggle** — not a paginated one-account-at-a-time wizard, and not a richer checking/savings/credit-card type selector (only the derived sign is stored today; a type enum can replace the toggle later if a second consumer needs one, without restructuring this screen). A "Save & continue" action is disabled until every row has a choice, and nothing persists until it's pressed — abandoning the flow partway leaves nothing saved, no default sign applied, consistent with ticket 06's "user-set, not inferred" decision.

See [ticket 07](../.scratch/wayfinder/streams-ux-design/tickets/07-connect-flow-expected-sign-ui.md) for the full resolution, including the two rejected directions (a paginated wizard asking account type; an inline confirmation with no separate screen).

## Multi-account view: shared timeline + total

All connected accounts show together on one screen, scrubbing in sync (standing decision — no per-account switcher). Layout:

- **One shared calendar chip** (month + day (optional year)), centered above the whole group — not repeated per account.
- **A "Total" stream leads the group**, above the individual account streams: a combined net-worth curve in neutral ink, visually distinct from the accent-green individual account streams below it, reading as the summary/hero element.
- **Each account's name** is pinned above the left edge of its own stream — no separate name column or per-account card header.
- **Balances render on the stream itself**, at the scrub position, as a small pill riding the crosshair — not a separate row of chips.
- **One shared drag-to-scrub surface** spans the total stream and every account stream: dragging anywhere scrubs everything together.

**Sign handling: never flatten, color the opposite-sign portion.** Thickness always tracks `|balance|` for every stream, including Total — it never zero-floors/flattens the way the original single-account scrubber (ticket 04) did. Instead, only the portion of a stream where the balance is on the _opposite_ of its expected side (checking overdrawn, credit card paid into credit, net worth negative) renders in a distinct brown — split as separate path segments so only that portion changes color, not the whole stream. The balance-pill number turns red in that same state. This generalizes more cleanly than zero-flooring (a flattened line hides _how_ negative something is; an abs-value band with a color change doesn't). `account-stream`'s single-view scrubber now adopts the same treatment — see [ticket 08](../.scratch/wayfinder/streams-ux-design/tickets/08-reconcile-sign-handling.md).

See [ticket 05](../.scratch/wayfinder/streams-ux-design/tickets/05-multi-account-stream-view.md) for the full resolution, including the two rejected layout directions (stacked full timelines; a grid with a shared slider).

## Multi-account view: mobile layout unchanged, just shrunk

At phone width, the multi-account view keeps the same structure and gesture as desktop — stacked full-width lanes, balances riding the bands as pills, one shared drag-to-scrub surface — just shorter lanes and a smaller calendar chip. Confirmed live against two structurally different alternatives (a pinned-Total-plus-swipeable-carousel layout; a fixed, off-band balance panel), both rejected outright in favor of the simpler "shrink in place" treatment.

**Global side effect:** the app shell's `main` element (`src/app/app.css`) had a fixed `1.5rem` horizontal padding that over-inset every page at narrow widths. Fixed with a `max-width: 480px` media query zeroing `main`'s left/right padding below that breakpoint only — applies to every route (`account-stream`, `connect-account` included), not just this one.

See [ticket 09](../.scratch/wayfinder/streams-ux-design/tickets/09-responsive-mobile-layout.md) for the full resolution.

## Error / loading states: inline banner

Errors render as a persistent, in-flow banner — an alert-colored box (icon + message + its own Retry button) sitting between the page header and the main content card, not a toast/snackbar and not folded into the header text. Loading (sync-in-progress) renders as a slim indeterminate progress bar directly under the header. Confirmed live on `account-stream` against two rejected alternatives: a dismissible floating toast at the bottom of the screen (with a shimmer-sweep loading treatment), and a status-strip approach that replaced the institution-name line with the error/loading text instead of using a separate banner.

Applies to all three states this ticket covers:

- `account-stream` resync error and sync-in-progress — demoed directly.
- `connect-account` connect failure — same banner pattern, not separately demoed since `connect-account`'s form isn't yet wearing the sage visual language (still plain/unstyled); apply once that page gets its own visual-language pass. Not a new design decision — same pattern.

See [ticket 10](../.scratch/wayfinder/streams-ux-design/tickets/10-error-loading-state-polish.md) for the full resolution.

## Sign handling: account-stream reconciled to never-flatten

`account-stream`'s single-account scrubber (ticket 04's design) adopts the same never-flatten/brown-segment treatment as the multi-account view (ticket 05), rather than keeping its original zero-floored/flat-line behavior — no aspect of viewing a single account argued for a different treatment there. The segmentation logic is **reimplemented for `account-stream`** rather than promoting `multi-account-stream-prototype/segmented-band.ts` as-is: that prototype code is functionally correct but was written throwaway-fast, and a clean implementation was preferred over reusing it verbatim.

See [ticket 08](../.scratch/wayfinder/streams-ux-design/tickets/08-reconcile-sign-handling.md) for the full resolution.
