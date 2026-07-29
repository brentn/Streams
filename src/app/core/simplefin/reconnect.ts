/**
 * SimpleFIN Bridge's own sign-in page — where a user re-links a broken bank connection. Any
 * bank-side 2FA/MFA challenge happens entirely on the bridge's site here; SimpleFIN's protocol
 * exposes no in-app mechanism for it (see docs/research/simplefin-errors-and-reauth.md, Q4).
 * The connection's existing SimpleFIN setup token stays valid throughout — re-linking here
 * doesn't issue a new one, so Streams never needs the user to paste anything back in; a plain
 * resync afterward is enough to clear needs-reauth.
 */
export const SIMPLEFIN_BRIDGE_URL = 'https://beta-bridge.simplefin.org/my-account';

/** Reauthorize banner action: open the bridge in a new tab for re-linking, staying on the
 * current page in the app — the caller is responsible for also triggering a resync. */
export function openSimpleFinBridge(): void {
  window.open(SIMPLEFIN_BRIDGE_URL, '_blank', 'noopener,noreferrer');
}
