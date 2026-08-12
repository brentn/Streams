import { describe, expect, it, vi } from 'vitest';
import { Transaction } from '../models/transaction';
import { deleteFlowCascade } from './delete-flow-cascade';

const matchedTxn: Transaction = {
  id: 'txn-1',
  accountId: 'acc-1',
  date: new Date('2026-07-20'),
  amount: -1500,
  description: 'RENT PAYMENT',
  matchedTarget: { kind: 'flow', id: 'flow-rent' },
};

const unrelatedTxn: Transaction = {
  id: 'txn-2',
  accountId: 'acc-1',
  date: new Date('2026-07-18'),
  amount: -6,
  description: 'COFFEE SHOP',
  matchedTarget: { kind: 'flow', id: 'flow-coffee' },
};

describe('deleteFlowCascade', () => {
  function storageStub() {
    return {
      getCategorizationRules: vi.fn().mockResolvedValue([]),
      deleteCategorizationRule: vi.fn().mockResolvedValue(undefined),
      getDirectCategorizations: vi.fn().mockResolvedValue([]),
      deleteDirectCategorization: vi.fn().mockResolvedValue(undefined),
      upsertTransactions: vi.fn().mockResolvedValue(undefined),
      deleteFlow: vi.fn().mockResolvedValue(undefined),
    };
  }

  it('deletes every Categorization Rule targeting the Flow, leaving others alone', async () => {
    const storage = storageStub();
    storage.getCategorizationRules.mockResolvedValue([
      { matchText: 'rent payment', target: { kind: 'flow', id: 'flow-rent' } },
      { matchText: 'rent late fee', target: { kind: 'flow', id: 'flow-rent' } },
      { matchText: 'coffee shop', target: { kind: 'flow', id: 'flow-coffee' } },
      { matchText: 'savings', target: { kind: 'transfer', id: 'flow-rent' } },
    ]);

    await deleteFlowCascade(storage as never, [], 'flow-rent');

    expect(storage.deleteCategorizationRule).toHaveBeenCalledTimes(2);
    expect(storage.deleteCategorizationRule).toHaveBeenCalledWith('rent payment');
    expect(storage.deleteCategorizationRule).toHaveBeenCalledWith('rent late fee');
  });

  it('unassigns every Transaction matched to the Flow, leaving others alone', async () => {
    const storage = storageStub();

    const result = await deleteFlowCascade(storage as never, [matchedTxn, unrelatedTxn], 'flow-rent');

    expect(storage.upsertTransactions).toHaveBeenCalledWith([{ ...matchedTxn, matchedTarget: null }]);
    expect(result).toEqual([{ ...matchedTxn, matchedTarget: null }, unrelatedTxn]);
  });

  it('does not call upsertTransactions when no Transaction is matched to the Flow', async () => {
    const storage = storageStub();

    await deleteFlowCascade(storage as never, [unrelatedTxn], 'flow-rent');

    expect(storage.upsertTransactions).not.toHaveBeenCalled();
  });

  it('deletes every Direct Categorization targeting the Flow, leaving others alone', async () => {
    const storage = storageStub();
    storage.getDirectCategorizations.mockResolvedValue([
      { transactionId: 'txn-1', target: { kind: 'flow', id: 'flow-rent' } },
      { transactionId: 'txn-2', target: { kind: 'flow', id: 'flow-coffee' } },
      { transactionId: 'txn-3', target: { kind: 'transfer', id: 'flow-rent' } },
    ]);

    await deleteFlowCascade(storage as never, [], 'flow-rent');

    expect(storage.deleteDirectCategorization).toHaveBeenCalledTimes(1);
    expect(storage.deleteDirectCategorization).toHaveBeenCalledWith('txn-1');
  });

  it('deletes the Flow itself', async () => {
    const storage = storageStub();

    await deleteFlowCascade(storage as never, [], 'flow-rent');

    expect(storage.deleteFlow).toHaveBeenCalledWith('flow-rent');
  });
});
