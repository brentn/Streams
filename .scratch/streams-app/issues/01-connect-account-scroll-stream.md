# 01 — Connect a bank Account via SimpleFIN and scroll its stream

**Migrated:** [brentn/Streams#10](https://github.com/brentn/Streams/issues/10) (closed — done). This local file is historical; GitHub is now the source of truth.

**What to build:** The walking skeleton for the whole app. A user connects a real bank Account via SimpleFIN, its current balance and Transactions sync into local storage, and the user can scroll that Account's stream backward through real history and forward through a (currently flat, since no Flows exist yet) projection.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] User can connect a real bank Account via SimpleFIN (claim token → Access URL exchange)
- [ ] Current real balance and recent Transactions sync in and persist locally in IndexedDB
- [ ] User can scroll the Account's stream backward and see actual historical balance reconstructed from real Transactions
- [ ] User can scroll the Account's stream forward and see a projected balance (flat continuation, since no Flows exist yet)
- [ ] Re-syncing updates the current balance and pulls in new Transactions without duplicating already-cached ones
- [ ] All synced data (Account, Transactions, SimpleFIN Access URL) persists locally in IndexedDB — no backend involved
