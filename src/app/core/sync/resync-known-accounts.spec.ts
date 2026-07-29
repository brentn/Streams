import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Account } from '../models/account';
import { SimpleFinAuthError } from '../simplefin/simplefin-adapter';
import { reconcileSyncedAccounts, resyncKnownAccounts } from './resync-known-accounts';

const known: Account = {
  id: 'acc-1',
  name: 'Checking',
  institutionName: 'Bank',
  balance: 100,
  balanceDate: new Date('2026-07-25'),
  expectedSign: -1, // deliberately not 1, to prove it's preserved rather than defaulted
  dryFloor: 250, // deliberately not 0, to prove it's preserved rather than defaulted
};

describe('resyncKnownAccounts', () => {
  let storage: {
    getAccessUrl: ReturnType<typeof vi.fn>;
    getAccounts: ReturnType<typeof vi.fn>;
    upsertAccount: ReturnType<typeof vi.fn>;
    upsertTransactions: ReturnType<typeof vi.fn>;
    getCategorizationRules: ReturnType<typeof vi.fn>;
  };
  let simplefin: { fetchAccounts: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    storage = {
      getAccessUrl: vi.fn().mockResolvedValue('https://user:pass@bridge.simplefin.org/simplefin'),
      getAccounts: vi.fn().mockResolvedValue([known]),
      upsertAccount: vi.fn(),
      upsertTransactions: vi.fn(),
      getCategorizationRules: vi.fn().mockResolvedValue([]),
    };
    simplefin = { fetchAccounts: vi.fn().mockResolvedValue([]) };
  });

  it('throws without persisting anything when there is no stored access URL', async () => {
    storage.getAccessUrl.mockResolvedValue(undefined);

    await expect(resyncKnownAccounts(storage as never, simplefin as never)).rejects.toThrow(
      'No SimpleFIN connection found.',
    );
    expect(simplefin.fetchAccounts).not.toHaveBeenCalled();
  });

  it('preserves the previously chosen expectedSign for a known account', async () => {
    simplefin.fetchAccounts.mockResolvedValue([
      { account: { ...known, balance: 999 }, transactions: [] },
    ]);

    await resyncKnownAccounts(storage as never, simplefin as never);

    expect(storage.upsertAccount).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'acc-1', balance: 999, expectedSign: -1 }),
    );
  });

  it('preserves the previously set dryFloor for a known account', async () => {
    simplefin.fetchAccounts.mockResolvedValue([
      { account: { ...known, balance: 999 }, transactions: [] },
    ]);

    await resyncKnownAccounts(storage as never, simplefin as never);

    expect(storage.upsertAccount).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'acc-1', dryFloor: 250 }),
    );
  });

  it('skips an account SimpleFIN returns that has no local counterpart', async () => {
    simplefin.fetchAccounts.mockResolvedValue([
      {
        account: {
          id: 'acc-new',
          name: 'New',
          institutionName: 'Bank',
          balance: 5,
          balanceDate: new Date(),
        },
        transactions: [],
      },
    ]);

    await resyncKnownAccounts(storage as never, simplefin as never);

    expect(storage.upsertAccount).not.toHaveBeenCalled();
  });

  it('upserts the synced transactions alongside a known account', async () => {
    const transactions = [
      {
        id: 't1',
        accountId: 'acc-1',
        date: new Date('2026-07-24'),
        amount: -10,
        description: 'x',
        matchedFlowId: null,
      },
    ];
    simplefin.fetchAccounts.mockResolvedValue([{ account: known, transactions }]);

    await resyncKnownAccounts(storage as never, simplefin as never);

    expect(storage.upsertTransactions).toHaveBeenCalledWith(transactions);
  });

  it('matches synced transactions against the current Categorization Rules', async () => {
    const transactions = [
      {
        id: 't1',
        accountId: 'acc-1',
        date: new Date('2026-07-24'),
        amount: -10,
        description: 'COFFEE SHOP #42',
        matchedFlowId: null,
      },
      {
        id: 't2',
        accountId: 'acc-1',
        date: new Date('2026-07-24'),
        amount: 500,
        description: 'PAYROLL DEPOSIT',
        matchedFlowId: null,
      },
    ];
    simplefin.fetchAccounts.mockResolvedValue([{ account: known, transactions }]);
    storage.getCategorizationRules.mockResolvedValue([
      { matchText: 'coffee shop', flowId: 'flow-coffee' },
    ]);

    await resyncKnownAccounts(storage as never, simplefin as never);

    expect(storage.upsertTransactions).toHaveBeenCalledWith([
      { ...transactions[0], matchedFlowId: 'flow-coffee' },
      { ...transactions[1], matchedFlowId: null },
    ]);
  });

  it('fans Needs Reauthentication onto every stored account and resolves rather than rethrowing on a 403', async () => {
    const otherAccount: Account = { ...known, id: 'acc-2' };
    storage.getAccounts.mockResolvedValue([known, otherAccount]);
    simplefin.fetchAccounts.mockRejectedValue(new SimpleFinAuthError('needs reauth'));

    await expect(resyncKnownAccounts(storage as never, simplefin as never)).resolves.toBeUndefined();

    expect(storage.upsertAccount).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'acc-1', syncStatus: { kind: 'needs-reauth' } }),
    );
    expect(storage.upsertAccount).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'acc-2', syncStatus: { kind: 'needs-reauth' } }),
    );
  });

  it('rethrows a non-auth failure rather than fanning Needs Reauthentication', async () => {
    simplefin.fetchAccounts.mockRejectedValue(new Error('network down'));

    await expect(resyncKnownAccounts(storage as never, simplefin as never)).rejects.toThrow(
      'network down',
    );
    expect(storage.upsertAccount).not.toHaveBeenCalled();
  });
});

describe('reconcileSyncedAccounts', () => {
  let storage: {
    getAccounts: ReturnType<typeof vi.fn>;
    upsertAccount: ReturnType<typeof vi.fn>;
    upsertTransactions: ReturnType<typeof vi.fn>;
    getCategorizationRules: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    storage = {
      getAccounts: vi.fn().mockResolvedValue([known]),
      upsertAccount: vi.fn(),
      upsertTransactions: vi.fn(),
      getCategorizationRules: vi.fn().mockResolvedValue([]),
    };
  });

  it('returns an account with no local counterpart as newAccounts, without persisting it', async () => {
    const fresh = {
      account: {
        id: 'acc-new',
        name: 'New',
        institutionName: 'Bank',
        balance: 5,
        balanceDate: new Date(),
      },
      transactions: [],
    };

    const result = await reconcileSyncedAccounts(storage as never, [fresh]);

    expect(result.newAccounts).toEqual([fresh]);
    expect(storage.upsertAccount).not.toHaveBeenCalled();
  });

  it('upserts a known account and omits it from newAccounts', async () => {
    const result = await reconcileSyncedAccounts(storage as never, [
      { account: { ...known, balance: 999 }, transactions: [] },
    ]);

    expect(result.newAccounts).toEqual([]);
    expect(storage.upsertAccount).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'acc-1', balance: 999, expectedSign: -1, dryFloor: 250 }),
    );
  });
});
