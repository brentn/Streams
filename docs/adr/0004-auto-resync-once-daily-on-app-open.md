# Auto-resync once per day on app open, not on every open or purely manually

Resync was manual-only (a button in `account-stream`/`multi-account-stream`). We decided the app should trigger a SimpleFIN resync automatically when opened, throttled to once per day via a persisted last-synced timestamp, rather than either resyncing on every open or leaving it manual-only. Manual-only was rejected because Needs Reauthentication / Sync Issue state (see `CONTEXT.md`) needs to reflect reality without the user remembering to hit "resync" — otherwise a broken connection could go unnoticed indefinitely. Resyncing on every open was rejected because SimpleFIN Bridge's own documented quota ("24 requests or fewer per day," per `docs/research/simplefin-errors-and-reauth.md`) means naively syncing on every open risks tripping rate limits or disabling the access token entirely, which would itself look identical to a real auth failure to the user.

## Consequences

- The throttle timestamp is itself persisted state Streams didn't need before — a new piece of storage, not just error data.
- Error/Sync Issue state can be up to a day stale in the worst case (opened once in the morning, connection breaks that afternoon, no second sync until the next day's open) — accepted as the cost of staying inside the daily quota.
