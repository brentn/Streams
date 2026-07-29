import { Router } from '@angular/router';

/**
 * SimpleFIN Bridge's own sign-in page — where a user re-links a broken bank connection and
 * generates a fresh setup token. Any bank-side 2FA/MFA challenge happens entirely on the
 * bridge's site here; SimpleFIN's protocol exposes no in-app mechanism for it (see
 * docs/research/simplefin-errors-and-reauth.md, Q4).
 */
export const SIMPLEFIN_BRIDGE_URL = 'https://beta-bridge.simplefin.org/my-account';

/**
 * Reconnect banner action: open the bridge in a new tab for re-linking, and still navigate to
 * Streams' own `/connect` page — the only place to paste the resulting fresh setup token, and
 * (per has-accounts-guard/home routing) the only discoverable route back to it.
 */
export function startReconnect(router: Router): void {
  window.open(SIMPLEFIN_BRIDGE_URL, '_blank', 'noopener,noreferrer');
  void router.navigateByUrl('/connect');
}
