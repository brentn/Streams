# 08 — Reconcile sign handling between account-stream and the multi-account view

**Type:** wayfinder:grilling
**Status:** closed
**Claimed by:** claude-session-2026-07-25
**Blocked by:** none

## Question

Ticket 04 locked the single-account `account-stream` scrubber's sign handling as zero-floored: thickness tracks `Math.max(0, balance * expectedSign)`, so a checking account overdrawn (or a credit card paid into credit) reads as a flat line.

Resolving ticket 05 (multi-account view) generalized this to never flatten: thickness tracks `|balance|` unconditionally, and only the portion of the stream on the *opposite* side of the account's expected sign renders in a distinct brown (segmented by contiguous sign runs), with the balance-pill number turning red in that state. This reads better — a flat line hides *how* far overdrawn something is; an abs-value band with a color change doesn't — but it was decided in the multi-account prototype (`src/app/features/multi-account-stream-prototype/segmented-band.ts`), not on `account-stream` itself.

The two screens now disagree on how the same conceptual situation (an account crossing to its opposite side) renders. Decide:

- Should `account-stream`'s single-view scrubber (ticket 04's design) be updated to match the never-flatten/brown-segment treatment, for consistency?
- If so, does the segmented-band approach built for the multi-account prototype get promoted to shared code (e.g. moved out of the throwaway `multi-account-stream-prototype/` folder into `account-stream/prototype-visual-language/`) rather than reimplemented, since it already does exactly this?
- Anything about the single-account context that might argue for keeping the two treatments different (e.g. is the flat-line reading actually preferable there for some reason)?

## Resolution

Yes on all three fronts, grilled live:

1. **`account-stream` updates to match.** Consistency wins — the reason never-flatten beat zero-flooring in the multi-account view (a flat line hides *how far* overdrawn something is) applies just as much to a single account viewed alone. No account-count-specific factor was in play.
2. **Reimplemented, not promoted.** `segmented-band.ts` (`multi-account-stream-prototype/`) does exactly the right thing functionally, but the human wants clean code over reuse of prototype-quality code as-is — an explicit override of the "promote as-is" recommendation. A fresh implementation for `account-stream` (natural home: alongside `curve.ts` in `account-stream/prototype-visual-language/`) replaces `curveToBand`'s zero-floor logic there; the prototype file itself is left in place as reference, not deleted, since this ticket is a decision, not the implementation.
3. **No single-account-specific reason to keep flat-line.** Confirmed — nothing about viewing one account changes the calculus.

Recorded in `docs/ux-spec.md` (new "Sign handling: account-stream reconciled to never-flatten" section; updated the "Scrubber: chart, not a range input" and "Multi-account view" sections' cross-references, which previously flagged the two screens as disagreeing).

