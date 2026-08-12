import { describe, expect, it, vi } from 'vitest';
import { Transaction } from '../models/transaction';
import { Transfer } from '../models/transfer';
import { deleteTransferCascade } from './delete-transfer-cascade';

const transfer: Transfer = {
  id: 'transfer-savings',
  fromAccountId: 'acc-checking',
  toAccountId: 'acc-savings',
  amount: 500,
  cadence: { period: 'month', interval: 1, anchors: [{ day: 1 }], anchorDate: new Date('2026-01-01') },
};

const matchedFromTxn: Transaction = {
  id: 'txn-1',
  accountId: 'acc-checking',
  date: new Date('2026-07-01'),
  amount: -500,
  description: 'TRANSFER TO SAVINGS',
  matchedTarget: { kind: 'transfer', id: 'transfer-savings' },
};

const matchedToTxn: Transaction = {
  id: 'txn-2',
  accountId: 'acc-savings',
  date: new Date('2026-07-01'),
  amount: 500,
  description: 'TRANSFER FROM CHECKING',
  matchedTarget: { kind: 'transfer', id: 'transfer-savings' },
};

const unrelatedTxn: Transaction = {
  id: 'txn-3',
  accountId: 'acc-checking',
  date: new Date('2026-07-18'),
  amount: -6,
  description: 'COFFEE SHOP',
  matchedTarget: { kind: 'flow', id: 'flow-coffee' },
};

describe('deleteTransferCascade', () => {
  function storageStub() {
    return {
      getCategorizationRules: vi.fn().mockResolvedValue([]),
      deleteCategorizationRule: vi.fn().mockResolvedValue(undefined),
      getDirectCategorizations: vi.fn().mockResolvedValue([]),
      deleteDirectCategorization: vi.fn().mockResolvedValue(undefined),
      getTransactionsForAccount: vi.fn().mockResolvedValue([]),
      upsertTransactions: vi.fn().mockResolvedValue(undefined),
      deleteTransfer: vi.fn().mockResolvedValue(undefined),
    };
  }

  it('deletes every Categorization Rule targeting the Transfer, leaving others alone', async () => {
    const storage = storageStub();
    storage.getCategorizationRules.mockResolvedValue([
      { matchText: 'transfer to savings', target: { kind: 'transfer', id: 'transfer-savings' } },
      { matchText: 'transfer from checking', target: { kind: 'transfer', id: 'transfer-savings' } },
      { matchText: 'coffee shop', target: { kind: 'flow', id: 'flow-coffee' } },
      { matchText: 'rent', target: { kind: 'flow', id: 'transfer-savings' } },
    ]);

    await deleteTransferCascade(storage as never, transfer);

    expect(storage.deleteCategorizationRule).toHaveBeenCalledTimes(2);
    expect(storage.deleteCategorizationRule).toHaveBeenCalledWith('transfer to savings');
    expect(storage.deleteCategorizationRule).toHaveBeenCalledWith('transfer from checking');
  });

  it('unassigns matched Transactions living on either the fromAccount or the toAccount', async () => {
    const storage = storageStub();
    storage.getTransactionsForAccount.mockImplementation((accountId: string) =>
      Promise.resolve(
        accountId === 'acc-checking' ? [matchedFromTxn, unrelatedTxn] : [matchedToTxn],
      ),
    );

    const result = await deleteTransferCascade(storage as never, transfer);

    expect(storage.getTransactionsForAccount).toHaveBeenCalledWith('acc-checking');
    expect(storage.getTransactionsForAccount).toHaveBeenCalledWith('acc-savings');
    expect(storage.upsertTransactions).toHaveBeenCalledWith([
      { ...matchedFromTxn, matchedTarget: null },
      { ...matchedToTxn, matchedTarget: null },
    ]);
    expect(result).toEqual([
      { ...matchedFromTxn, matchedTarget: null },
      unrelatedTxn,
      { ...matchedToTxn, matchedTarget: null },
    ]);
  });

  it('does not call upsertTransactions when no Transaction is matched to the Transfer', async () => {
    const storage = storageStub();
    storage.getTransactionsForAccount.mockResolvedValue([unrelatedTxn]);

    await deleteTransferCascade(storage as never, transfer);

    expect(storage.upsertTransactions).not.toHaveBeenCalled();
  });

  it('deletes every Direct Categorization targeting the Transfer, leaving others alone', async () => {
    const storage = storageStub();
    storage.getDirectCategorizations.mockResolvedValue([
      { transactionId: 'txn-1', target: { kind: 'transfer', id: 'transfer-savings' } },
      { transactionId: 'txn-2', target: { kind: 'flow', id: 'transfer-savings' } },
      { transactionId: 'txn-3', target: { kind: 'transfer', id: 'other-transfer' } },
    ]);

    await deleteTransferCascade(storage as never, transfer);

    expect(storage.deleteDirectCategorization).toHaveBeenCalledTimes(1);
    expect(storage.deleteDirectCategorization).toHaveBeenCalledWith('txn-1');
  });

  it('deletes the Transfer itself', async () => {
    const storage = storageStub();

    await deleteTransferCascade(storage as never, transfer);

    expect(storage.deleteTransfer).toHaveBeenCalledWith('transfer-savings');
  });
});
