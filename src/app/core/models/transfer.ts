import { AmountChange, Cadence } from './flow';

/**
 * A single expected movement of money between two of the user's own Accounts,
 * applied symmetrically (the same amount leaves fromAccountId and arrives in
 * toAccountId at the same time). Scheduled like a recurring-kind Flow — a
 * Cadence plus an ordered Step Change/Recurring Rule timeline for the amount.
 */
export interface Transfer {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  cadence: Cadence;
  amountChanges?: AmountChange[];
}
