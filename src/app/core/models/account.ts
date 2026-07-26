/** Asset (1) or liability (-1). */
export type Sign = 1 | -1;

export interface Account {
  id: string;
  name: string;
  institutionName: string;
  balance: number;
  balanceDate: Date;
  /** User-set at connect time, never inferred. */
  expectedSign: Sign;
}
