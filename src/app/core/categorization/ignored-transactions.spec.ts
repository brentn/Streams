import { describe, expect, it } from 'vitest';
import { isIgnored } from './ignored-transactions';

describe('isIgnored', () => {
  it('returns true when the transaction id has a matching Ignored record', () => {
    expect(isIgnored('txn-1', [{ transactionId: 'txn-1' }])).toBe(true);
  });

  it('returns false when no record matches the transaction id', () => {
    expect(isIgnored('txn-1', [{ transactionId: 'txn-2' }])).toBe(false);
  });

  it('returns false for an empty list', () => {
    expect(isIgnored('txn-1', [])).toBe(false);
  });
});
