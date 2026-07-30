import { describe, expect, it } from 'vitest';
import { CategorizationRule } from '../models/categorization-rule';
import { Transaction } from '../models/transaction';
import { categorizeTransactions, matchTarget, normalizeMatchText } from './categorization';

describe('normalizeMatchText', () => {
  it('trims and lowercases', () => {
    expect(normalizeMatchText('  Amazon Prime  ')).toBe('amazon prime');
  });
});

describe('matchTarget', () => {
  it('returns null when no rule matches', () => {
    const rules: CategorizationRule[] = [
      { matchText: 'coffee', target: { kind: 'flow', id: 'flow-coffee' } },
    ];

    expect(matchTarget('PAYROLL DEPOSIT', rules)).toBeNull();
  });

  it('returns null when there are no rules', () => {
    expect(matchTarget('COFFEE SHOP', [])).toBeNull();
  });

  it('matches a substring case-insensitively', () => {
    const rules: CategorizationRule[] = [
      { matchText: 'coffee', target: { kind: 'flow', id: 'flow-coffee' } },
    ];

    expect(matchTarget('COFFEE SHOP #42', rules)).toEqual({ kind: 'flow', id: 'flow-coffee' });
  });

  it('matches to a Transfer target the same way as a Flow target', () => {
    const rules: CategorizationRule[] = [
      { matchText: 'to savings', target: { kind: 'transfer', id: 'transfer-1' } },
    ];

    expect(matchTarget('TRANSFER TO SAVINGS', rules)).toEqual({ kind: 'transfer', id: 'transfer-1' });
  });

  it('picks the longest (most specific) match when multiple rules match', () => {
    const rules: CategorizationRule[] = [
      { matchText: 'amazon', target: { kind: 'flow', id: 'flow-shopping' } },
      { matchText: 'amazon prime', target: { kind: 'flow', id: 'flow-subscriptions' } },
    ];

    expect(matchTarget('AMAZON PRIME*1A2B3', rules)).toEqual({ kind: 'flow', id: 'flow-subscriptions' });
    expect(matchTarget('AMAZON MARKETPLACE PURCHASE', rules)).toEqual({
      kind: 'flow',
      id: 'flow-shopping',
    });
  });

  it('is unaffected by rule order when picking the longest match', () => {
    const rules: CategorizationRule[] = [
      { matchText: 'amazon prime', target: { kind: 'flow', id: 'flow-subscriptions' } },
      { matchText: 'amazon', target: { kind: 'flow', id: 'flow-shopping' } },
    ];

    expect(matchTarget('AMAZON PRIME*1A2B3', rules)).toEqual({ kind: 'flow', id: 'flow-subscriptions' });
  });
});

describe('categorizeTransactions', () => {
  it('re-derives matchedTarget for every Transaction from the given rules', () => {
    const rules: CategorizationRule[] = [
      { matchText: 'coffee shop', target: { kind: 'flow', id: 'flow-coffee' } },
    ];
    const transactions: Transaction[] = [
      {
        id: 't1',
        accountId: 'acc-1',
        date: new Date('2026-07-20'),
        amount: -4.5,
        description: 'COFFEE SHOP #42',
        matchedTarget: null,
      },
      {
        id: 't2',
        accountId: 'acc-1',
        date: new Date('2026-07-19'),
        amount: 2000,
        description: 'PAYROLL DEPOSIT',
        matchedTarget: { kind: 'flow', id: 'stale-flow-id' },
      },
    ];

    expect(categorizeTransactions(transactions, rules)).toEqual([
      { ...transactions[0], matchedTarget: { kind: 'flow', id: 'flow-coffee' } },
      { ...transactions[1], matchedTarget: null },
    ]);
  });

  it('re-derives matchedTarget as a Transfer when a rule targets one', () => {
    const rules: CategorizationRule[] = [
      { matchText: 'to savings', target: { kind: 'transfer', id: 'transfer-1' } },
    ];
    const transactions: Transaction[] = [
      {
        id: 't1',
        accountId: 'acc-1',
        date: new Date('2026-07-20'),
        amount: -500,
        description: 'TRANSFER TO SAVINGS',
        matchedTarget: null,
      },
    ];

    expect(categorizeTransactions(transactions, rules)).toEqual([
      { ...transactions[0], matchedTarget: { kind: 'transfer', id: 'transfer-1' } },
    ]);
  });
});
