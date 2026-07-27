# 03 — Export and import local data

**Migrated:** [brentn/Streams#12](https://github.com/brentn/Streams/issues/12) (open). This local file is historical; GitHub is now the source of truth.

**What to build:** A user-controlled backup mechanism, since there is no backend and no cross-device sync (ADR-0002). Built generically over whatever's in local storage so it doesn't need rework as later tickets add new entity types.

**Blocked by:** 01 — Connect a bank Account via SimpleFIN and scroll its stream

**Status:** ready-for-agent

- [ ] User can export all locally stored data (at this point: Accounts, Transactions, the SimpleFIN Access URL) to a downloadable file
- [ ] User can import a previously exported file and have it fully restore local IndexedDB state
- [ ] Export/import is implemented generically over whatever object stores exist, rather than hardcoded to today's schema, so it continues to work as later tickets add new entity types
