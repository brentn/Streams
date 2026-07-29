import { Account, AccountSyncStatus } from '../models/account';

/**
 * Merges a component's transient operation-error (the existing catch-block `errorMessage`
 * from a failed sync attempt) with an Account's persisted `syncStatus`, by priority:
 * operation-error > needs-reauth > sync-issue > ok. Feeds the one `StatusBanner` slot on
 * `account-stream` — no indicator for a suppressed lower-priority state.
 */
export type DerivedBannerState =
  | { kind: 'operation-error'; message: string }
  | { kind: 'needs-reauth' }
  | { kind: 'sync-issue'; message: string }
  | { kind: 'ok' };

export function derivedBannerState(
  operationError: string | null,
  syncStatus: AccountSyncStatus | undefined,
): DerivedBannerState {
  if (operationError) return { kind: 'operation-error', message: operationError };
  const status = syncStatus ?? { kind: 'ok' };
  if (status.kind === 'needs-reauth') return { kind: 'needs-reauth' };
  if (status.kind === 'sync-issue') return { kind: 'sync-issue', message: status.message };
  return { kind: 'ok' };
}

/**
 * The connection-level counterpart for `multi-account-stream`'s top banner: fanned, not
 * per-lane, and — unlike `derivedBannerState` — has no sync-issue tier, since Sync Issue
 * surfaces per account via the small lane badge instead (see CONTEXT.md).
 */
export function connectionBannerState(
  operationError: string | null,
  accounts: Account[],
): DerivedBannerState {
  if (operationError) return { kind: 'operation-error', message: operationError };
  if (accounts.some((a) => a.syncStatus?.kind === 'needs-reauth')) return { kind: 'needs-reauth' };
  return { kind: 'ok' };
}

export interface BannerPresentation {
  message: string | null;
  severity: 'critical' | 'serious' | 'warning';
  retryLabel: string;
}

/**
 * Maps a `DerivedBannerState`/`connectionBannerState` result onto `StatusBanner`'s inputs — the
 * one place that owns Needs Reauthentication's copy and action label, shared by `account-stream`
 * and `multi-account-stream` so the two don't drift. `retryLabel` doubles as the signal for
 * which action the caller's click handler should take (resync vs. navigate to `/connect`) —
 * 'Reconnect' only ever appears for `needs-reauth`.
 */
export function bannerPresentation(state: DerivedBannerState): BannerPresentation {
  switch (state.kind) {
    case 'operation-error':
      return { message: state.message, severity: 'critical', retryLabel: 'Retry' };
    case 'needs-reauth':
      return {
        message: 'Your SimpleFIN connection needs to be reconnected.',
        severity: 'serious',
        retryLabel: 'Reconnect',
      };
    case 'sync-issue':
      return { message: state.message, severity: 'warning', retryLabel: 'Retry' };
    case 'ok':
      // severity/retryLabel are unreachable here — StatusBanner only renders its banner (and
      // thus only reads them) when message is truthy.
      return { message: null, severity: 'critical', retryLabel: 'Retry' };
  }
}
