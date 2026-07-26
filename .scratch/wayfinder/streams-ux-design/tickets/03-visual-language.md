# 03 — Visual language: palette, typography, dark mode

**Type:** wayfinder:prototype
**Status:** closed
**Claimed by:** claude-code session (2026-07-25)
**Blocked by:** 01, 02

## Question

Define Streams' visual language: color palette, typography, and whether/how dark mode is supported.

Use `/prototype` to build concrete swatches/type samples to react to rather than deciding in the abstract. Incorporate ticket 02's outcome — if a component library was chosen, start from its design tokens rather than from scratch; if hand-rolled CSS, this ticket is defining those tokens outright. If the palette needs to support data visualization (the balance curve, the actual-vs-projected distinction — likely, given tickets 04–05), consult the `dataviz` skill's palette guidance before finalizing.

Record the decided palette, type scale, and dark-mode approach in `docs/ux-spec.md` (create it if this is the first ticket to resolve).

## Resolution

**Palette:** neutral tokens from dataviz's reference palette (surfaces, ink primary/secondary/muted, gridlines, borders), declared for both light and dark explicitly (dual CSS custom-property declaration, not an automatic invert). Accent is Sage's brand green (Pantone 2271 C, confirmed via web search against brandcolorcode.com): `#00D639` in dark mode as-is (8.86:1 contrast against dark surface `#1a1a19`), stepped to `#00A63E` in light mode — same hue family, OKLCH H≈147° vs the brand's 144.8° — since raw `#00D639` only reaches 1.92:1 on the light surface `#fcfcfb` (below the dataviz validator's 3:1 floor); `#00A63E` reaches 3.14:1. Both computed via `dataviz`'s validator, not eyeballed.

**Typography:** system sans throughout (`system-ui, -apple-system, "Segoe UI", sans-serif`), no display/serif face. Tabular-nums for the balance figure and other aligned numerics. Type scale: eyebrow labels `0.75rem` uppercase/muted, account name `1.25rem`/600, institution/body `0.875rem`, hero balance `2.5rem`/700 in a card-bound context (a raw-amount treatment without a card, e.g. inline next to a date, uses a smaller `1.4rem` — sized to its container, not a second scale).

**Dark mode:** OS-driven only (`prefers-color-scheme`), no in-app manual toggle — matches ADR 0002's minimal-footprint intent (no toggle UI, no persisted preference to store).

**Base layout language:** a light-first bordered card (eyebrow label → hero figure → supporting text), confirmed live against fixture data as variant "Ledger" among four prototyped directions (Ledger; a dark-first full-bleed hero; a chart-less editorial/typographic treatment; and a green-accented exploration, "Sage band").

**Carried forward, not decided here:** reacting to the Sage-band variant surfaced a strong, well-liked direction for the *account-stream scrubber itself* — balance encoded as line thickness (zero-floored per account's expected sign) over a panning ~6-month window, a calendar-day marker, and direct drag-to-scrub replacing the range input. That's ticket 04's question (scrubber redesign), not this ticket's — carried forward there as a concrete candidate rather than decided here. The prototype code lives at `src/app/features/account-stream/prototype-visual-language/` (variants A–D, switchable via `?variant=`, dev-only), left in place for ticket 04 to continue from rather than thrown away, since no winner has been chosen yet.
