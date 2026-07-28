export interface Transaction {
  id: string;
  accountId: string;
  date: Date;
  amount: number;
  description: string;
  /** The Flow this Transaction is categorized to, or `null` if no Categorization Rule matched. */
  matchedFlowId: string | null;
}
