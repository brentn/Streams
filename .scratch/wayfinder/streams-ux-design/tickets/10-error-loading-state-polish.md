# 10 — Error / loading-state visual treatment

**Type:** wayfinder:prototype
**Status:** closed
**Claimed by:** claude-session-2026-07-25
**Blocked by:** none

## Question

The map's fog originally noted this as dependent on the component-library decision (ticket 02) — a visual component library might have supplied error/loading patterns for free. Ticket 02 resolved to **Angular CDK, headless only** (no visual opinion, no error/loading UI out of the box), so that dependency is now settled: **a custom visual treatment is needed regardless**, sharpening this from fog into a real question.

Design the visual treatment, consistent with ticket 03's visual language (sage accent, neutral `dataviz` tokens, system sans) and ticket 02's "hand-rolled CSS over headless CDK chrome" approach, for the states `account-stream` already has plumbing for but no considered design:

- **Connect failure** (SimpleFIN token rejected or unreachable, in `connect-account`).
- **Resync error** (`account-stream`'s `errorMessage` signal — currently just plain text, see `src/app/features/account-stream/account-stream.ts`).
- **Sync-in-progress** (`account-stream`'s `isSyncing` signal — no loading treatment defined yet).

Use `/prototype` (UI branch) against the existing `account-stream` and `connect-account` routes/error paths to make the options concrete before deciding.

## Resolution

Built three treatments layered on the sage-band chart (the ticket 03/04 winner), reacted to live on `account-stream` via `?variant=f|g|h`, with dev-only debug buttons to force `isSyncing`/`errorMessage` into view without a real SimpleFIN failure:

- **`f` — Inline banner**: a persistent, in-flow red banner between the header and the chart card (icon + message + its own Retry button); loading shows as a slim indeterminate progress bar under the header.
- **`g` — Toast overlay**: error as a dismissible floating toast pinned to the bottom of the screen; loading as a shimmer sweep over the whole chart card.
- **`h` — Status strip**: no separate banner/toast — the institution-name line itself becomes the status line (error text or a spinner), Re-sync button shrinks to an icon.

**`f` (inline banner) wins outright.** In-flow and persistent beat both the overlay pattern (toast) and the header-integrated pattern (status strip) — no reasons given against it, just picked directly.

**Generalizes to all three target states:**

- `account-stream` resync error → the banner, demoed.
- `account-stream` sync-in-progress → the progress bar under the header, demoed.
- `connect-account` connect failure → same banner pattern (alert box, icon + message + retry), **not separately demoed** — `connect-account`'s form isn't yet wearing the sage visual language (still the plain unstyled form, same status as `account-stream`'s default `''` variant), so dropping a fully-styled banner into an otherwise-unstyled page would look mismatched rather than validate anything new. Apply the same banner pattern there once `connect-account` gets its own visual-language pass; no separate design decision needed — it's the same pattern, not a new question.

`g` and `h` are kept in `account-stream/prototype-visual-language/` as rejected alternatives, same convention as tickets 04/05/09's rejected variants — not deleted.

Recorded in `docs/ux-spec.md`.

