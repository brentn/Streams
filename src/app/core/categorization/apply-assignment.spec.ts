import { describe, expect, it, vi } from 'vitest';
import { Transaction } from '../models/transaction';
import { applyAssignment } from './apply-assignment';

const unmatched: Transaction = {
  id: 'txn-1',
  accountId: 'acc-1',
  date: new Date('2026-07-20'),
  amount: -4.5,
  description: 'COFFEE SHOP #42',
  matchedTarget: null,
};

const otherCoffee: Transaction = {
  id: 'txn-3',
  accountId: 'acc-1',
  date: new Date('2026-07-18'),
  amount: -6,
  description: 'COFFEE SHOP #99',
  matchedTarget: null,
};

describe('applyAssignment', () => {
  function storageStub() {
    return {
      upsertFlow: vi.fn(),
      upsertCategorizationRule: vi.fn(),
      getCategorizationRules: vi.fn().mockResolvedValue([]),
      upsertTransactions: vi.fn(),
    };
  }

  it('upserts a Categorization Rule and re-derives matchedTarget for every given Transaction', async () => {
    const storage = storageStub();
    storage.getCategorizationRules.mockResolvedValue([
      { matchText: 'coffee shop', target: { kind: 'flow', id: 'flow-coffee' } },
    ]);

    const result = await applyAssignment(storage as never, [unmatched, otherCoffee], {
      matchText: 'coffee shop',
      target: { kind: 'flow', id: 'flow-coffee' },
    });

    expect(storage.upsertCategorizationRule).toHaveBeenCalledWith({
      matchText: 'coffee shop',
      target: { kind: 'flow', id: 'flow-coffee' },
    });
    expect(storage.upsertTransactions).toHaveBeenCalledWith([
      { ...unmatched, matchedTarget: { kind: 'flow', id: 'flow-coffee' } },
      { ...otherCoffee, matchedTarget: { kind: 'flow', id: 'flow-coffee' } },
    ]);
    expect(result).toEqual([
      { ...unmatched, matchedTarget: { kind: 'flow', id: 'flow-coffee' } },
      { ...otherCoffee, matchedTarget: { kind: 'flow', id: 'flow-coffee' } },
    ]);
  });

  it('persists a newly created Flow before the Categorization Rule', async () => {
    const storage = storageStub();
    const newFlow = { id: 'flow-new' } as never;

    await applyAssignment(storage as never, [unmatched], {
      matchText: 'coffee shop',
      target: { kind: 'flow', id: 'flow-new' },
      newFlow,
    });

    const upsertFlowOrder = storage.upsertFlow.mock.invocationCallOrder[0];
    const upsertRuleOrder = storage.upsertCategorizationRule.mock.invocationCallOrder[0];
    expect(storage.upsertFlow).toHaveBeenCalledWith(newFlow);
    expect(upsertFlowOrder).toBeLessThan(upsertRuleOrder);
  });

  it('does not upsert a Flow when none was created', async () => {
    const storage = storageStub();

    await applyAssignment(storage as never, [unmatched], {
      matchText: 'coffee shop',
      target: { kind: 'transfer', id: 'transfer-1' },
    });

    expect(storage.upsertFlow).not.toHaveBeenCalled();
  });
});
