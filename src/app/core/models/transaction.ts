/** What a Transaction (or a Categorization Rule) is matched to — a Flow or a Transfer, never both. */
export type MatchedTarget = { kind: 'flow'; id: string } | { kind: 'transfer'; id: string };

export interface Transaction {
  id: string;
  accountId: string;
  date: Date;
  amount: number;
  description: string;
  /** The Flow or Transfer this Transaction is categorized to, or `null` if no Categorization Rule matched. */
  matchedTarget: MatchedTarget | null;
}
