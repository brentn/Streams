/** Asset (1) or liability (-1). */
export type Sign = 1 | -1;

/**
 * An Account's SimpleFIN sync health, classified from `errlist` codes (or an
 * HTTP 403) on the most recent fetch — never inferred from `msg` text. Needs
 * Reauthentication is blocking and persists until reconnect; Sync Issue is
 * informational and expected to clear on a later sync. See CONTEXT.md.
 */
export type AccountSyncStatus =
  | { kind: 'ok' }
  | { kind: 'needs-reauth' }
  | { kind: 'sync-issue'; message: string };

export interface Account {
  id: string;
  name: string;
  institutionName: string;
  balance: number;
  balanceDate: Date;
  /** User-set at connect time, never inferred. */
  expectedSign: Sign;
  /** The Dry Floor: crossing below it triggers a Running-Dry Alert; defaults to $0. */
  dryFloor: number;
  /** Undefined for an Account stored before this field existed, or one synced with no error data yet — treat as 'ok'. */
  syncStatus?: AccountSyncStatus;
}
