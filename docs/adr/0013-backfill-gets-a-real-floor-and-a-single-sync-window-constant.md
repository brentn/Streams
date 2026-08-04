# Backfill gets a real stopping point, and the 40/60-day split collapses into one Sync Floor

`computeBackfillChunks` (`sync-window.ts`) had no floor: it derives `excess = now - cursor - 40days` from `simplefinOldestFetchedAt`, a cursor that only ever moves backward and is never re-anchored forward once an account is caught up. Each chunk always overshoots by a full ~39 days regardless of how small the actual excess was, and that overshoot becomes the next call's excess — so repeated manual "Re-sync" clicks (a normal thing to do while setting up new accounts) compound almost immediately: 1 chunk, then 2, then 4, then 7, then capped at 10, reaching years into the past within a handful of clicks, even for an account 5 days old. There was also no distinction between a brand-new account (no history to backfill toward at all) and a Dormant Gap (a valid connection that's genuinely missing a bounded span of transactions) — both were run through the same unbounded cursor walk.

We're giving backfill two distinct, bounded stopping conditions instead of one open-ended one: a brand-new Account, and a connection recovering from Needs Reauthentication, both sync forward from a fixed **Sync Floor** (40 days back) and never reach further, since neither case has continuous prior coverage to backfill toward. A **Dormant Gap** — a still-valid connection that just went unsynced for a stretch — backfills in 40-day chunks until the chunk boundary reaches back to where continuous coverage already existed, which is a real, reachable floor rather than a receding target. See CONTEXT.md.

We're also collapsing the 60-day product cap (originally proposed as distinct from the 40-day technical chunk size) down to a single 40-day constant. 60 was arbitrary; 40 was already chosen deliberately, with margin under SimpleFIN Bridge's 45-day advisory threshold (`sync-window.ts:4-7`). Keeping two numbers would have meant a new account's initial catch-up needed two chunked requests to reach a 60-day floor instead of one request landing exactly on the technical limit.

## Considered Options

- **Unbounded Dormant Gap backfill** (walk back until SimpleFIN returns nothing, no relation to prior coverage) — rejected: reintroduces an open-ended walk, just with a different trigger; the whole point is giving backfill a floor.
- **Auto-resync also runs backfill**, now that it's bounded — rejected for now: kept manual-only, matching today's behavior and ADR-0004's request-quota protection. An account with a Dormant Gap self-heals only via repeated manual "Re-sync," not automatically overnight.
- **Two-tier constant** (60-day product floor, 40-day technical chunk size) — rejected: 60 was arbitrary, and splitting the two would have cost a brand-new account an extra chunked request to close the gap between 40 and 60 for no real benefit.
- **Derive the migration reset point from the earliest transaction already stored locally**, rather than re-bootstrapping to the Floor — rejected: the affected accounts are only days old with no genuine gap to reconcile toward; a flat reset to the Floor is simpler and correct for this case.

## Consequences

- `simplefinOldestFetchedAt` must be re-anchored (not just walked backward) once a Dormant Gap closes, so a caught-up account stops being backfill-eligible — this is the actual bug fix, not merely the constant change.
- Existing accounts affected by the pre-fix behavior need a one-time migration: reset `simplefinOldestFetchedAt` to the Sync Floor rather than trusting the already-drifted stored value.
- A connection recovering from Needs Reauthentication after a long outage does **not** get the outage transactions backfilled — it resets to the Sync Floor like a brand-new account, same as before this ADR only reasoned about brand-new accounts.
