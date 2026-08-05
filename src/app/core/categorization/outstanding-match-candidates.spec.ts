import { describe, expect, it } from 'vitest';
import { CategorizationRule } from '../models/categorization-rule';
import { RecurringFlow } from '../models/flow';
import { Transaction } from '../models/transaction';
import { rankMatchCandidates } from './outstanding-match-candidates';

const rent: RecurringFlow = {
  id: 'flow-rent',
  accountId: 'acc-1',
  name: 'Rent',
  direction: 'out',
  kind: 'recurring',
  amount: 1200,
  cadence: { period: 'month', interval: 1, anchors: [{ day: 1 }], anchorDate: new Date('2026-01-01') },
};

const occurrenceDate = new Date('2026-07-01');

function txn(id: string, amount: number, date: Date, description: string): Transaction {
  return { id, accountId: 'acc-1', date, amount, description, matchedTarget: null };
}

describe('rankMatchCandidates', () => {
  it('excludes a Transaction whose sign does not match the Flow direction', () => {
    const wrongDirection = txn('t1', 1200, occurrenceDate, 'LANDLORD LLC');
    const rightDirection = txn('t2', -1200, occurrenceDate, 'LANDLORD LLC');

    const candidates = rankMatchCandidates(rent, occurrenceDate, 1200, [wrongDirection, rightDirection], []);

    expect(candidates.map((c) => c.transaction.id)).toEqual(['t2']);
  });

  it('includes an already-matched Transaction as a candidate, not just unmatched ones', () => {
    const alreadyMatched: Transaction = {
      ...txn('t1', -1200, occurrenceDate, 'LANDLORD LLC'),
      matchedTarget: { kind: 'flow', id: 'some-other-flow' },
    };

    const candidates = rankMatchCandidates(rent, occurrenceDate, 1200, [alreadyMatched], []);

    expect(candidates).toHaveLength(1);
  });

  it('ranks a Transaction matching an existing Categorization Rule for this Flow above one that only matches the Flow name', () => {
    const rules: CategorizationRule[] = [{ matchText: 'landlord llc', target: { kind: 'flow', id: 'flow-rent' } }];
    const ruleMatch = txn('t1', -1200, occurrenceDate, 'LANDLORD LLC AUTOPAY');
    const nameOnlyMatch = txn('t2', -1200, occurrenceDate, 'RENT PAYMENT CO');

    const candidates = rankMatchCandidates(rent, occurrenceDate, 1200, [nameOnlyMatch, ruleMatch], rules);

    expect(candidates[0].transaction.id).toBe('t1');
  });

  it('does not crash on a Categorization Rule left with no target by an old schema/migration', () => {
    const malformed = { matchText: 'landlord llc' } as unknown as CategorizationRule;
    const candidate = txn('t1', -1200, occurrenceDate, 'LANDLORD LLC AUTOPAY');

    expect(() => rankMatchCandidates(rent, occurrenceDate, 1200, [candidate], [malformed])).not.toThrow();
  });

  it('ignores a Categorization Rule that targets a different Flow', () => {
    const rules: CategorizationRule[] = [{ matchText: 'landlord llc', target: { kind: 'flow', id: 'flow-other' } }];
    const unrelatedRuleMatch = txn('t1', -1200, occurrenceDate, 'LANDLORD LLC AUTOPAY');
    const nameMatch = txn('t2', -1200, occurrenceDate, 'RENT PAYMENT CO');

    const candidates = rankMatchCandidates(rent, occurrenceDate, 1200, [unrelatedRuleMatch, nameMatch], rules);

    expect(candidates[0].transaction.id).toBe('t2');
  });

  it('ranks a Transaction dated closer to the occurrence above a farther one, all else equal', () => {
    const close = txn('t1', -1200, new Date('2026-07-02'), 'GENERIC PAYEE');
    const far = txn('t2', -1200, new Date('2026-07-20'), 'GENERIC PAYEE');

    const candidates = rankMatchCandidates(rent, occurrenceDate, 1200, [far, close], []);

    expect(candidates[0].transaction.id).toBe('t1');
  });

  it('ranks a Transaction closer in amount above a farther one, all else equal', () => {
    const close = txn('t1', -1190, occurrenceDate, 'GENERIC PAYEE');
    const far = txn('t2', -700, occurrenceDate, 'GENERIC PAYEE');

    const candidates = rankMatchCandidates(rent, occurrenceDate, 1200, [far, close], []);

    expect(candidates[0].transaction.id).toBe('t1');
  });

  it('returns an empty list when there are no same-direction Transactions', () => {
    const candidates = rankMatchCandidates(rent, occurrenceDate, 1200, [], []);

    expect(candidates).toEqual([]);
  });

  it('ranks a partial word-overlap match with the Flow name above one sharing no words at all', () => {
    // Neither candidate contains "home depot" as a literal substring, so this exercises the
    // fractional token-overlap fallback rather than the full-score substring-match branch:
    // "depot" is the one word "PAYMENT FROM DEPOT STORE" shares with the Flow name, giving it a
    // score strictly between 0 and 1, while the other candidate shares no words at all.
    const homeDepot = { ...rent, name: 'Home Depot' };
    const partialOverlap = txn('t1', -1200, occurrenceDate, 'PAYMENT FROM DEPOT STORE');
    const noOverlap = txn('t2', -1200, occurrenceDate, 'GENERIC AUTOPAY CO');

    const candidates = rankMatchCandidates(homeDepot, occurrenceDate, 1200, [noOverlap, partialOverlap], []);

    expect(candidates[0].transaction.id).toBe('t1');
  });
});
