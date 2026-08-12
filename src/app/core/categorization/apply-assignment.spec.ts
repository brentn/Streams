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
      getDirectCategorizations: vi.fn().mockResolvedValue([]),
      upsertDirectCategorization: vi.fn(),
      deleteDirectCategorization: vi.fn(),
      upsertTransactions: vi.fn(),
      upsertIgnoredTransaction: vi.fn(),
    };
  }

  describe('rule mode', () => {
    it('upserts a Categorization Rule and re-derives matchedTarget for every given Transaction', async () => {
      const storage = storageStub();
      storage.getCategorizationRules.mockResolvedValue([
        { matchText: 'coffee shop', target: { kind: 'flow', id: 'flow-coffee' } },
      ]);

      const result = await applyAssignment(storage as never, [unmatched, otherCoffee], {
        mode: 'rule',
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
        mode: 'rule',
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
        mode: 'rule',
        matchText: 'coffee shop',
        target: { kind: 'transfer', id: 'transfer-1' },
      });

      expect(storage.upsertFlow).not.toHaveBeenCalled();
    });
  });

  describe('direct mode', () => {
    it('upserts a Direct Categorization for just the named Transaction and leaves other Transactions untouched', async () => {
      const storage = storageStub();

      const result = await applyAssignment(storage as never, [unmatched, otherCoffee], {
        mode: 'direct',
        transactionId: 'txn-1',
        target: { kind: 'flow', id: 'flow-coffee' },
      });

      expect(storage.upsertDirectCategorization).toHaveBeenCalledWith({
        transactionId: 'txn-1',
        target: { kind: 'flow', id: 'flow-coffee' },
      });
      expect(storage.upsertCategorizationRule).not.toHaveBeenCalled();
      expect(storage.upsertTransactions).toHaveBeenCalledWith([
        { ...unmatched, matchedTarget: { kind: 'flow', id: 'flow-coffee' } },
      ]);
      expect(result).toEqual([
        { ...unmatched, matchedTarget: { kind: 'flow', id: 'flow-coffee' } },
        otherCoffee,
      ]);
    });

    it('persists a newly created Flow before the Direct Categorization', async () => {
      const storage = storageStub();
      const newFlow = { id: 'flow-new' } as never;

      await applyAssignment(storage as never, [unmatched], {
        mode: 'direct',
        transactionId: 'txn-1',
        target: { kind: 'flow', id: 'flow-new' },
        newFlow,
      });

      const upsertFlowOrder = storage.upsertFlow.mock.invocationCallOrder[0];
      const upsertDirectOrder = storage.upsertDirectCategorization.mock.invocationCallOrder[0];
      expect(storage.upsertFlow).toHaveBeenCalledWith(newFlow);
      expect(upsertFlowOrder).toBeLessThan(upsertDirectOrder);
    });
  });

  describe('remove-direct mode', () => {
    it('deletes the Direct Categorization and falls back to the current rule-derived target for just that Transaction', async () => {
      const storage = storageStub();
      storage.getCategorizationRules.mockResolvedValue([
        { matchText: 'coffee shop', target: { kind: 'flow', id: 'flow-coffee' } },
      ]);

      const result = await applyAssignment(storage as never, [unmatched, otherCoffee], {
        mode: 'remove-direct',
        transactionId: 'txn-1',
      });

      expect(storage.deleteDirectCategorization).toHaveBeenCalledWith('txn-1');
      expect(storage.upsertTransactions).toHaveBeenCalledWith([
        { ...unmatched, matchedTarget: { kind: 'flow', id: 'flow-coffee' } },
      ]);
      expect(result).toEqual([
        { ...unmatched, matchedTarget: { kind: 'flow', id: 'flow-coffee' } },
        otherCoffee,
      ]);
    });

    it('falls back to null when no Categorization Rule matches either', async () => {
      const storage = storageStub();

      const result = await applyAssignment(storage as never, [unmatched], {
        mode: 'remove-direct',
        transactionId: 'txn-1',
      });

      expect(result).toEqual([{ ...unmatched, matchedTarget: null }]);
    });
  });

  describe('ignore mode', () => {
    it('upserts an Ignored Transaction for just the named Transaction and leaves matchedTarget untouched', async () => {
      const storage = storageStub();

      const result = await applyAssignment(storage as never, [unmatched, otherCoffee], {
        mode: 'ignore',
        transactionId: 'txn-1',
      });

      expect(storage.upsertIgnoredTransaction).toHaveBeenCalledWith({ transactionId: 'txn-1' });
      expect(result).toEqual([unmatched, otherCoffee]);
    });

    it('does not upsert Transactions or touch Categorization Rules/Direct Categorization', async () => {
      const storage = storageStub();

      await applyAssignment(storage as never, [unmatched], { mode: 'ignore', transactionId: 'txn-1' });

      expect(storage.upsertTransactions).not.toHaveBeenCalled();
      expect(storage.upsertCategorizationRule).not.toHaveBeenCalled();
      expect(storage.upsertDirectCategorization).not.toHaveBeenCalled();
    });
  });
});
