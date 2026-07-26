# 09 — Implement the UX redesign

**What to build:** Replace the throwaway prototype UI (`account-stream/prototype-visual-language/`, `multi-account-stream-prototype/`, `connect-account/prototype-expected-sign/`) with a production implementation of the decisions in `docs/ux-spec.md`, from the now-closed `streams-ux-design` wayfinder map (`.scratch/wayfinder/streams-ux-design/`).

**Blocked by:** 01 — Connect a bank Account via SimpleFIN and scroll its stream

**Status:** ready-for-agent

- [ ] Angular CDK added as a dependency; used for generic chrome (dialogs/menus/overlay/focus-trap) per the spec's "Component library" section
- [ ] Design tokens (light/dark CSS custom properties: sage accent, neutrals, type scale) established app-wide, replacing today's unstyled CSS
- [ ] `Account` model gains `expectedSign: 1 | -1`; `StorageRepository` IndexedDB schema updated accordingly (version bump)
- [ ] New connect-flow step: after SimpleFIN connect, one screen listing every returned account with an Asset/Liability toggle per row; nothing persists until "Save & continue," disabled until every row has a choice
- [ ] `account-stream`'s scrubber becomes the drag-to-scrub thickness-band chart (replacing the range input), including the never-flatten/brown-segment sign treatment
- [ ] Multi-account view (shared timeline + leading "Total" + per-account bands, synchronized scrubbing) becomes the real production screen users land on — no per-account switcher
- [ ] Responsive: multi-account view shrinks in place at phone width; global `main` padding fix applied app-wide
- [ ] Error/loading states: inline banner + retry button (errors), slim indeterminate progress bar under header (syncing) — applied to both `account-stream` and `connect-account`
- [ ] Prototype-only code removed once production replaces it: `prototype-visual-language/`, `multi-account-stream-prototype/`, `prototype-expected-sign/`, the `/prototype/multi-account-stream` route, and the dev-mode variant switchers
- [ ] `npm test` and `npm run build` pass; manually verified in a browser (light + dark, desktop + phone width)

Full design rationale and decisions: `docs/ux-spec.md`. Ticket-level detail if needed: `.scratch/wayfinder/streams-ux-design/tickets/01` through `10`.
