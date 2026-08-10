# SimpleFIN's own name/institution is tracked separately from the user's local rename

This supersedes ADR-0015's deferred option ("Track a separate `simplefinName`/`simplefinInstitutionName` pair on every Account, refreshed every sync, immune to local renames — considered as the fully general long-term fix, deferred") and its Consequences bullet describing the manual one-time bridge ("align the `name` field back to SimpleFIN's current name... then resync").

ADR-0015 shipped `reconcileOrphanedAccounts`, matching a SimpleFIN id-reissued account against stored `needs-reauth` Accounts by exact `name` **and** `institutionName` equality, and deferred tracking SimpleFIN's own identity separately, reasoning the "compound case" — an id reissue happening *after* the user has locally renamed the account — would be rare.

That reasoning doesn't hold: both `name` and `institutionName` are user-editable in Settings (`account-form.ts`), and the user confirmed they actively rename both. For this user, the compound case isn't rare — it's the default. Matching only against the locally-owned fields means auto-recovery would silently fail for every account they've ever renamed, on every future SimpleFIN id-reissue. That's not an acceptable long-term state for a feature whose entire point is "no manual step needed."

We're shipping the deferred option now: `Account` gains `simplefinName`/`simplefinInstitutionName`, refreshed on every successful sync (`withLocalFieldsPreserved`, shared by `reconcileSyncedAccounts` and `reconcileOrphanedAccounts`) and seeded at first connection (`connect-account.ts`). `reconcileOrphanedAccounts` matches against `simplefinName ?? name` and `simplefinInstitutionName ?? institutionName` — falling back to today's ADR-0015 behavior for any Account with no successful sync since this shipped, so nothing regresses, and gaining full immunity to local renames once populated.

## Considered Options

- **Match on `name`/`institutionName` alone (ADR-0015's shipped behavior)** — rejected as the permanent answer: breaks on every local rename, which this user does routinely. Kept only as the automatic fallback for not-yet-populated Accounts.
- **`??` fallback vs. `||` (match if either the tracked field or the local field agrees)** — rejected `||`: once `simplefinName` is populated it's authoritative; OR'ing it back together with the local `name` would reopen the exact false-positive-merge risk ADR-0015 rejected (a stale local rename coincidentally matching a *different* institution's current raw name).
- **DB migration to backfill `simplefinName` for existing Accounts** — rejected: there's no historical record of what SimpleFIN called an account before this field existed; nothing to backfill from. Existing Accounts simply start `undefined` and populate on their next successful sync, same no-migration-needed precedent as `dryFloor` (v7)/`syncStatus` (v10).

## Consequences

- Accounts already orphaned before this shipped (this app's own affected accounts among them) still need a one-time manual step, but it's now non-destructive: since `exportAll()`/`importAll()` are fully generic (every field of every record), the user can **add** `simplefinName`/`simplefinInstitutionName` directly to the exported JSON for each stuck, already-renamed account — set to whatever SimpleFIN currently reports — leaving their real chosen `name`/`institutionName` completely untouched, then re-import. This replaces ADR-0015's Consequences bullet, which required temporarily overwriting the local rename and renaming back afterward.
- Every future relink self-heals with no manual step at all, for any Account that's had at least one successful sync since this shipped — the common case going forward, regardless of how often the user renames things.
- A false-negative (zero or multiple candidates) is still silently inert, same as ADR-0015 — no new UI, no error surfaced.
