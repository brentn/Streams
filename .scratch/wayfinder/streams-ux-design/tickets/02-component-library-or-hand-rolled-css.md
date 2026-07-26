# 02 — Component library vs. hand-rolled CSS

**Type:** wayfinder:grilling
**Status:** closed
**Claimed by:** claude-code session (2026-07-25)
**Blocked by:** 01

## Question

Decide whether Streams adopts a component library (e.g. Angular Material, or a lighter alternative) or continues hand-rolled CSS for the whole app going forward — a repo-wide architectural call, not scoped to just the two existing screens.

Weigh:
- Bundle size / the "minimal footprint" framing in `docs/adr/0002-static-client-only-architecture.md` — a library may or may not sit comfortably with that ADR's intent; if it doesn't, this ticket needs to either justify an amendment or rule the library option out.
- Built-in dark-mode support (feeds ticket 03).
- Development velocity for the remaining 7 screens not yet built (Flows, Transfers, alerts, etc.) — a library pays off more the more screens are still ahead.
- Control over the "stream you scroll through time" visual identity — a generic component library's look may fight the product's distinctive framing, especially for the scrubber (ticket 04).

## Resolution

Hybrid: **Angular CDK** (first-party, headless, no default styles) for generic chrome behavior — dialogs, menus, listboxes/comboboxes, overlay/focus-trap a11y — styled with hand-rolled CSS on top. Applies across all screens, including the 7 not yet built. The scrubber and balance-stream timeline stay fully custom regardless, since no library supplies the "stream you scroll through time" identity out of the box.

CDK alone for now, not a third-party headless kit — reach for one (e.g. Spartan/ng-primitives) only if a future screen surfaces a gap CDK doesn't cover. Rationale for headless over a full library (Material/Bootstrap, both considered): a full library's own visual identity would need active, ongoing override to avoid fighting the product's distinctive framing, especially risky for the scrubber and multi-account view.

Fits ADR 0002's "minimal footprint" intent as-is (CDK is tree-shakeable, no default styles) — no ADR amendment needed. Recorded in `docs/ux-spec.md` § "Component library: Angular CDK, headless" rather than a new ADR, per the map's Notes designating ux-spec.md as the consolidation point.

Consequence for ticket 03: CDK supplies no dark-mode tokens, so dark mode is fully defined by ticket 03's own custom design tokens, not inherited from a library.
