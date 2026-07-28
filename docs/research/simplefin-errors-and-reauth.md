# SimpleFIN: error shape and re-authentication signaling

This document answers five specific questions about how the SimpleFIN protocol represents
errors and signals that a connection needs re-authentication. It feeds the data-model and
UX design decision in issue #36 (part of the #35 "wayfinder" map) about how Streams should
model SimpleFIN errors and build a reauthentication flow. All findings below are traced to
primary sources: the SimpleFIN protocol spec (and its GitHub-hosted markdown source), the
SimpleFIN Bridge site, and the SimpleFIN Bridge developer guide.

Primary sources used:
- https://www.simplefin.org/protocol.html (current protocol, "Version 2", rendered HTML)
- https://raw.githubusercontent.com/simplefin/simplefin.github.com/master/protocol.md (same spec, raw markdown source — used for verbatim quoting)
- https://www.simplefin.org/protocol-v1.html / https://raw.githubusercontent.com/simplefin/simplefin.github.com/master/protocol-v1.md (SimpleFIN Version 1, the older/deprecated protocol version)
- https://beta-bridge.simplefin.org/info/developers (SimpleFIN Bridge's own developer guide; `bridge.simplefin.org` currently redirects here)
- https://github.com/simplefin (official GitHub org, used to confirm what reference repos exist)

Note on versions: SimpleFIN v2 is the current spec and is what Streams' adapter should target going
forward. SimpleFIN v1 is explicitly marked superseded ("Older versions: SimpleFIN Version 1") but is
included here because its `errors` field shape is the shape Streams' current code was seemingly written
against, and the contrast is directly relevant to the implications below.

---

## 1. Is `errors` only top-level, or can it also appear nested inside individual account objects?

**Top-level only, in both v1 and v2.** In neither protocol version does the `Account` object schema
define an `errors`/`errlist` field of its own.

- v2 `Account Set` schema (top level of the `/accounts` response) declares both fields:
  > `errlist | array of Errors | yes | List of errors` and `errors | array | no (DEPRECATED) | Array of strings suitable for displaying to a user.`
  ([protocol.md](https://raw.githubusercontent.com/simplefin/simplefin.github.com/master/protocol.md), "Account Set" section)
- The v2 `Account` object schema lists only `id, name, conn_id, currency, balance, available-balance, balance-date, transactions, extra` — no error field. ([protocol.md](https://raw.githubusercontent.com/simplefin/simplefin.github.com/master/protocol.md), "Account" section)
- v1's `Account Set` schema is the same shape, just with the older field name: `errors | array | yes | Array of strings suitable for displaying to a user.`, and its `Account` schema (`org, id, name, currency, balance, available-balance, balance-date, transactions, extra`) likewise has no error field. ([protocol-v1.md](https://raw.githubusercontent.com/simplefin/simplefin.github.com/master/protocol-v1.md))

What v2 *does* do instead of nesting: each entry in the top-level `errlist` array may carry an optional
`account_id` (or `conn_id`) attribute that says *which* account/connection the error is about, e.g.:
```json
{ "code": "act.failed", "msg": "Failed to get all transactions. Try again later.", "account_id": "ACT-1982398-12398192839182398123" }
```
So account-specific errors are referenced by ID from the top-level list, not embedded in the account object itself.

## 2. Is `errors` always a plain array of strings, or does the protocol specify structured data?

**Both exist, at different protocol versions — v1 is plain strings, v2 introduces a structured object with error codes.**

- v1 (and the deprecated v2 field kept for back-compat): `errors` is "Array of strings suitable for displaying to a user." — plain human-readable strings, no codes, no severity, no URLs. ([protocol-v1.md](https://raw.githubusercontent.com/simplefin/simplefin.github.com/master/protocol-v1.md))
- v2's replacement, `errlist`, is an array of structured **Error** objects:
  > `code | string | yes | One of the codes listed below` · `msg | string | yes | String error suitable for displaying to users` · `conn_id | string | no | ...` · `account_id | string | no | ...`
  ([protocol.md](https://raw.githubusercontent.com/simplefin/simplefin.github.com/master/protocol.md), "Error" section)
- `code` values are a small fixed vocabulary in `prefix.subcode` form (`gen.`, `gen.api`, `gen.auth`, `con.`, `con.auth`, `act.`, `act.failed`, `act.missingdata`), with the spec explicitly instructing consumers to fall back to the naked prefix for unknown subcodes: "Consumers of the protocol should handle unknown subcodes by falling back to treating the error like a naked `prefix.`" (same source, "Codes" subsection)
- No severity levels and no URLs are part of the documented `Error` schema — only `code`, `msg`, and the optional `conn_id`/`account_id` references.

## 3. Documented convention for signaling that an account/connection needs re-authentication?

**Yes, via HTTP status and error codes — but no boolean flag on the account object, and no fixed message-text convention.**

- HTTP status: `GET /accounts` documents a `403` response as: "Authentication failed. This could be because access has been revoked or if the credentials are incorrect." ([protocol.md](https://raw.githubusercontent.com/simplefin/simplefin.github.com/master/protocol.md), "GET /accounts > Responses")
- Error codes: `gen.auth` ("General authentication error (to the SimpleFIN Server)") and `con.auth` ("Authentication issue for a connection") are the documented codes for auth-specific failures, e.g. `{"code": "con.auth", "msg": "Authentication failed for My Bank - Jim", "conn_id": "CON-..."}`. (same source, "Error > Codes")
- **No boolean/flag field** exists on the `Account` or `Connection` object schema to mark "needs reauth" — the signal is entirely via the 403 status code and/or a `con.auth`/`gen.auth` coded entry in `errlist`, potentially even inside an otherwise-200 response if only some connections are broken.
- **No fixed message-text convention** is specified for `msg` strings. The v1 spec's own example response happens to use the string `"You must reauthenticate."` inside `errors: [...]` ([protocol-v1.md](https://raw.githubusercontent.com/simplefin/simplefin.github.com/master/protocol-v1.md), "App Quickstart > 4. Get Data"), but this is illustrative example text in a sample JSON payload, not a normative requirement that servers use that exact phrase — nothing in the spec says clients should pattern-match on message text. Detection should key off `code`/HTTP status, not string content.
- No URL-back-to-bridge field on the account/error object either (see Q4).

## 4. Does the bridge expose a URL/API mechanism for re-authentication, or is it entirely outside any client-observable API?

**Entirely outside any client-observable API response — no reauth URL or mechanism is returned inline anywhere in the documented protocol or bridge docs.**

- The only bridge URLs the spec documents are for *initial* connection setup: `GET /create` ("An application directs a user to this URL to initiate a bank-app connection", example `https://bridge.simplefin.org/simplefin/create`) and `POST /claim/:token`. ([protocol.md](https://raw.githubusercontent.com/simplefin/simplefin.github.com/master/protocol.md), "App Quickstart" and "HTTP Endpoints")
- Neither the `Error` object schema nor the `403` response documentation includes any URL field pointing back to the bridge for reconnecting a broken connection.
- The SimpleFIN Bridge's own developer guide (https://beta-bridge.simplefin.org/info/developers) documents the error/limits behavior of the API in detail (see Q5) but contains **no** mention of a reconnect/reauthenticate flow, deep link, or per-connection management URL returned to client apps. Its only account-management surface is the bridge's own web UI, reached via "Sign in" (`/auth/login`) — something the *user* navigates to independently, not something the client app is handed a URL for.
- Conclusion: per the documented protocol and the bridge's own docs, re-authentication is **not** a client-driven API flow. The practical implication (undocumented, but the only path consistent with the spec) is that a client app can at best detect "this connection is broken" (via 403 or `con.auth`/`gen.auth`) and tell the user to go re-establish the connection themselves at their bridge/server's own site — the same generic `/create` flow used for initial setup, not a targeted "fix this one connection" deep link.

## 5. Other documented error conditions — rate limiting, outages, deleted/closed accounts, pending accounts?

**Some are documented (account-level transient failures, a payment-required status, and bridge-specific rate limits); others are not documented at all.**

- **Transient account-level failures** are distinguished from auth failures by a different code prefix/subcode:
  - `act.failed`: "Failed to get account information. Try again later." (account-level, retryable)
  - `act.missingdata`: "Incomplete transaction listing. Try again later." (account-level, partial data, retryable)
  These are structurally distinct from `con.auth`/`gen.auth` by their `act.` vs `con./gen.` prefix, which is exactly the mechanism the spec says clients should key off. ([protocol.md](https://raw.githubusercontent.com/simplefin/simplefin.github.com/master/protocol.md), "Error > Codes")
- **Billing/payment status**: `GET /accounts` documents a `402 Payment required` response code, distinct from `403`. ([protocol.md](https://raw.githubusercontent.com/simplefin/simplefin.github.com/master/protocol.md), "GET /accounts > Responses")
- **Rate limiting** is not in the core protocol spec at all, but the SimpleFIN Bridge's developer guide documents its own quota policy: "you are expected to make 24 requests or fewer per day... Making more requests than expected will eventually cause warning messages to appear in the `"errors"` array. Exceeding the expected rate limits beyond the warning level will result in Access Tokens being disabled." ([beta-bridge.simplefin.org/info/developers](https://beta-bridge.simplefin.org/info/developers), "Limits" section). Note this is bridge-specific operational policy, not a core-protocol-defined error code — it surfaces as ordinary warning strings in the errors array rather than a dedicated rate-limit code, and importantly, exceeding it can eventually disable the Access Token entirely, which would then present to the client exactly like a `403`/auth failure even though the root cause is rate limiting, not a revoked/changed credential.
- **Pending/still-processing accounts**: the spec's `pending` field exists only on the **Transaction** object ("`pending` boolean, optional... `true` indicates that this transaction has not yet posted"), not on the Account object. There is no documented "this account is still being set up/synced" state at the account level.
- **Deleted/closed accounts**: not documented anywhere in the spec. There is no error code, flag, or status for a closed/removed account — an account that disappears from the `accounts` array is presumably how this is meant to be inferred, but the spec does not say so explicitly. This is undocumented/implementation-defined.
- Distinguishing mechanism overall: the spec's answer to "how do you tell these apart" is the `code` prefix (`gen.`/`con.`/`act.`) plus the optional `conn_id`/`account_id` scoping field — not HTTP status alone (both `act.failed` and `con.auth` can arrive in an otherwise-200 response inside `errlist`, while `403` at the HTTP level is reserved specifically for whole-connection authentication failure per the `GET /accounts` endpoint doc).

---

## Implications for Streams

`src/app/core/simplefin/simplefin-adapter.ts` currently types the response as
`interface SimpleFinAccountsResponse { accounts: SimpleFinAccount[] }` and treats any non-2xx response
as a generic thrown `Error`. Given the findings above:

- **The response type needs a top-level `errlist` (and, for back-compat, optionally `errors`) field.** Right now `SimpleFinAccountsResponse` has no error field at all, so any `errlist` entries returned alongside a `200 OK` (e.g. one broken connection among several healthy ones) are silently dropped by `fetchAccounts` — `data.accounts.map(toSyncedAccount)` never looks at `data.errlist`. Per Q1/Q5, these structured errors can arrive in an otherwise-successful response, scoped to a specific `conn_id`/`account_id`, so per-account/per-connection sync status can't be partially degraded today — it's all-or-nothing based on HTTP status alone.
- **`errlist` entries should be typed as structured objects (`{ code, msg, conn_id?, account_id? }`), not `string[]`.** The current code has no error type to update, but if one is added it should model v2's `code`/`msg`/`conn_id`/`account_id` shape (Q2) rather than assuming plain strings — and detection of "needs reauth" should switch on `code` starting with `con.auth` or `gen.auth` (or the bare prefixes as fallback), never on matching `msg` text (Q3 warns the spec's `"You must reauthenticate."` string is only an illustrative v1 example, not a contract).
- **The blanket `if (!response.ok) throw new Error(...)` on line 61-63 collapses distinct failure modes into one code path.** A `403` (revoked/incorrect credentials, per Q3) and a `402` (payment required, per Q5) are different conditions the spec explicitly distinguishes by status code, but Streams currently surfaces both as an identical generic thrown error with no field the UI could use to decide whether to prompt "reconnect this account" vs. something else.
- **There is no reauth deep-link to surface, so the UX must be self-service, not API-driven (Q4).** Since neither the protocol nor the SimpleFIN Bridge's developer docs expose any per-connection "fix this" URL back from an error/403, Streams' planned reauthentication UX cannot deep-link into the bridge for a specific broken connection — the most it can do is detect the failure (403, or `con.auth`/`gen.auth` in `errlist`) and route the user back through the same generic "connect a new SimpleFIN token" flow already used for initial setup, replacing the stored Access URL for that connection once a new token is claimed.
- **`SimpleFinAccount.org?.name` doesn't match the current (v2) schema at all**, which is a pre-existing mismatch independent of error handling: v2 moves organization/connection identity out of the `Account` object entirely and into a separate top-level `connections` array (with `conn_id`, `name`, `org_id`, `org_url`) that accounts reference via `conn_id` — there is no `org` field on `Account` in v2 (only in the superseded v1 schema, which used `org: { domain, sfin-url }`, not `org.name` either). Worth checking against a real bridge response before relying on `institutionName` derivation.
- **`act.failed`/`act.missingdata` ("try again later") are a distinct, retryable category the current code can't distinguish from a hard failure** — both would currently just cause `fetchAccounts` to either throw (if HTTP-level) or be silently ignored (if inside `errlist` on a 200), rather than being surfaced as "temporarily degraded, will retry" versus "action needed."
