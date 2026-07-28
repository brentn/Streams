import { describe, expect, it } from 'vitest';
import { CategorizationRule } from '../models/categorization-rule';
import { Transaction } from '../models/transaction';
import { categorizeTransactions, matchFlowId, normalizeMatchText } from './categorization';

describe('normalizeMatchText', () => {
  it('trims and lowercases', () => {
    expect(normalizeMatchText('  Amazon Prime  ')).toBe('amazon prime');
  });
});

describe('matchFlowId', () => {
  it('returns null when no rule matches', () => {
    const rules: CategorizationRule[] = [{ matchText: 'coffee', flowId: 'flow-coffee' }];

    expect(matchFlowId('PAYROLL DEPOSIT', rules)).toBeNull();
  });

  it('returns null when there are no rules', () => {
    expect(matchFlowId('COFFEE SHOP', [])).toBeNull();
  });

  it('matches a substring case-insensitively', () => {
    const rules: CategorizationRule[] = [{ matchText: 'coffee', flowId: 'flow-coffee' }];

    expect(matchFlowId('COFFEE SHOP #42', rules)).toBe('flow-coffee');
  });

  it('picks the longest (most specific) match when multiple rules match', () => {
    const rules: CategorizationRule[] = [
      { matchText: 'amazon', flowId: 'flow-shopping' },
      { matchText: 'amazon prime', flowId: 'flow-subscriptions' },
    ];

    expect(matchFlowId('AMAZON PRIME*1A2B3', rules)).toBe('flow-subscriptions');
    expect(matchFlowId('AMAZON MARKETPLACE PURCHASE', rules)).toBe('flow-shopping');
  });

  it('is unaffected by rule order when picking the longest match', () => {
    const rules: CategorizationRule[] = [
      { matchText: 'amazon prime', flowId: 'flow-subscriptions' },
      { matchText: 'amazon', flowId: 'flow-shopping' },
    ];

    expect(matchFlowId('AMAZON PRIME*1A2B3', rules)).toBe('flow-subscriptions');
  });
});

describe('categorizeTransactions', () => {
  it('re-derives matchedFlowId for every Transaction from the given rules', () => {
    const rules: CategorizationRule[] = [{ matchText: 'coffee shop', flowId: 'flow-coffee' }];
    const transactions: Transaction[] = [
      {
        id: 't1',
        accountId: 'acc-1',
        date: new Date('2026-07-20'),
        amount: -4.5,
        description: 'COFFEE SHOP #42',
        matchedFlowId: null,
      },
      {
        id: 't2',
        accountId: 'acc-1',
        date: new Date('2026-07-19'),
        amount: 2000,
        description: 'PAYROLL DEPOSIT',
        matchedFlowId: 'stale-flow-id',
      },
    ];

    expect(categorizeTransactions(transactions, rules)).toEqual([
      { ...transactions[0], matchedFlowId: 'flow-coffee' },
      { ...transactions[1], matchedFlowId: null },
    ]);
  });
});
