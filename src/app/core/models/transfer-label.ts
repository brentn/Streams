import { Account } from './account';
import { mostRecentOccurrence, occurrencesInRange } from '../projection/cadence';
import { Transfer } from './transfer';

/** Matches Angular's `mediumDate` format (e.g. "Jul 1, 2026") without pulling in `@angular/common` — this file is a plain model, framework-free like the rest of `core/models`. */
const MEDIUM_DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** Framed from `accountId`'s point of view — Transfer has no name of its own. Shared by `AssignFlowDialog`'s picker and `TributaryPanel`'s header/badge, so the same Transfer reads identically in both places. */
export function transferLabel(transfer: Transfer, accountId: string, accounts: Account[]): string {
  const otherId = transfer.fromAccountId === accountId ? transfer.toAccountId : transfer.fromAccountId;
  const otherName = accounts.find((a) => a.id === otherId)?.name ?? '(unknown account)';
  return transfer.fromAccountId === accountId ? `Transfer to ${otherName}` : `Transfer from ${otherName}`;
}

/** Defensive upper bound for the forward search below. In practice `mostRecentOccurrence` only
 *  returns null for a one-time Transfer scheduled after `asOfDate`, whose sole occurrence is
 *  always found well inside this window. */
const FALLBACK_SEARCH_YEARS = 10;

/** The latest occurrence at/before `asOfDate`, or — if `asOfDate` predates the Transfer's first
 *  occurrence entirely (e.g. a one-time Transfer scheduled after it) — the next occurrence at/after
 *  it. Falls back to `asOfDate` itself only if nothing turns up within `FALLBACK_SEARCH_YEARS`,
 *  which shouldn't happen for any real Transfer. */
function nearestOccurrence(transfer: Transfer, asOfDate: Date): Date {
  const recent = mostRecentOccurrence(transfer.cadence, asOfDate);
  if (recent) return recent.occurrence;
  const horizon = new Date(
    asOfDate.getFullYear() + FALLBACK_SEARCH_YEARS,
    asOfDate.getMonth(),
    asOfDate.getDate(),
  );
  return occurrencesInRange(transfer.cadence, asOfDate, horizon)[0] ?? asOfDate;
}

/** `transferLabel()` plus the occurrence nearest `asOfDate`, so two Transfers between the same
 *  Account pair read distinctly in a picker — `transferLabel()` alone can't tell them apart. */
export function transferOptionLabel(
  transfer: Transfer,
  accountId: string,
  accounts: Account[],
  asOfDate: Date,
): string {
  const base = transferLabel(transfer, accountId, accounts);
  const occurrence = nearestOccurrence(transfer, asOfDate);
  return `${base} — ${MEDIUM_DATE.format(occurrence)}`;
}
