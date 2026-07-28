# Fan connection-level SimpleFIN errors onto each Account; no separate Connection entity

SimpleFIN v2's `errlist` scopes an error to either a `conn_id` (whole connection) or an `account_id` (single account), and the protocol has a first-class `connections` array alongside `accounts`. Streams only supports a single SimpleFIN connection today (`StorageRepository.getAccessUrl()` is one URL, not a list), so we chose not to introduce a persisted `Connection` entity to mirror that protocol shape. Instead, a connection-level error (`con.auth`, `gen.auth`, or a bodyless HTTP 403) is fanned out to mark every stored `Account` as Needs Reauthentication directly — modeling only the account-level scoping SimpleFIN actually exercises for this app today, not the connection-level one as a distinct stored entity.

## Consequences

- If Streams ever supports multiple SimpleFIN connections, this needs revisiting — fanning a connection error onto N accounts loses the "these N accounts share one broken connection" relationship, which would matter once there's more than one connection to distinguish.
