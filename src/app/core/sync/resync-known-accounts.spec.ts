import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Account } from '../models/account';
import { SimpleFinAuthError } from '../simplefin/simplefin-adapter';
import { computeBackfillChunks, computeNormalSyncStartDate, MAX_SYNC_LOOKBACK_DAYS } from './sync-window';
import { fetchNormalSyncWindow, reconcileSyncedAccounts, resyncKnownAccounts } from './resync-known-accounts';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-07-29T12:00:00Z');
const ACCESS_URL = 'https://user:pass@bridge.simplefin.org/simplefin';

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
    getLastSyncedAt: ReturnType<typeof vi.fn>;
    getOldestFetchedAt: ReturnType<typeof vi.fn>;
    saveOldestFetchedAt: ReturnType<typeof vi.fn>;
  };
  let simplefin: { fetchAccounts: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    storage = {
      getAccessUrl: vi.fn().mockResolvedValue(ACCESS_URL),
      getAccounts: vi.fn().mockResolvedValue([known]),
      upsertAccount: vi.fn(),
      upsertTransactions: vi.fn(),
      getCategorizationRules: vi.fn().mockResolvedValue([]),
      getLastSyncedAt: vi.fn().mockResolvedValue(undefined),
      // Recent by default so existing/unrelated tests don't incidentally trigger backfill.
      getOldestFetchedAt: vi.fn().mockResolvedValue(new Date(NOW.getTime() - 10 * DAY_MS)),
      saveOldestFetchedAt: vi.fn(),
    };
    simplefin = { fetchAccounts: vi.fn().mockResolvedValue([]) };
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it('preserves the locally-owned name and institutionName for a known account', async () => {
    simplefin.fetchAccounts.mockResolvedValue([
      { account: { ...known, name: 'SimpleFIN Name', institutionName: 'SimpleFIN Bank', balance: 999 }, transactions: [] },
    ]);

    await resyncKnownAccounts(storage as never, simplefin as never);

    expect(storage.upsertAccount).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'acc-1', name: 'Checking', institutionName: 'Bank' }),
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
        matchedTarget: null,
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
        matchedTarget: null,
      },
      {
        id: 't2',
        accountId: 'acc-1',
        date: new Date('2026-07-24'),
        amount: 500,
        description: 'PAYROLL DEPOSIT',
        matchedTarget: null,
      },
    ];
    simplefin.fetchAccounts.mockResolvedValue([{ account: known, transactions }]);
    storage.getCategorizationRules.mockResolvedValue([
      { matchText: 'coffee shop', target: { kind: 'flow', id: 'flow-coffee' } },
    ]);

    await resyncKnownAccounts(storage as never, simplefin as never);

    expect(storage.upsertTransactions).toHaveBeenCalledWith([
      { ...transactions[0], matchedTarget: { kind: 'flow', id: 'flow-coffee' } },
      { ...transactions[1], matchedTarget: null },
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

  it('fetches the normal sync window with no end-date, per computeNormalSyncStartDate', async () => {
    storage.getLastSyncedAt.mockResolvedValue(new Date(NOW.getTime() - 10 * DAY_MS));

    await resyncKnownAccounts(storage as never, simplefin as never);

    const expectedStartDate = computeNormalSyncStartDate(
      new Date(NOW.getTime() - 10 * DAY_MS),
      NOW,
    );
    expect(simplefin.fetchAccounts).toHaveBeenCalledWith(ACCESS_URL, expectedStartDate);
  });

  it('initializes the backfill cursor to the 40-day ceiling on first sync when none is stored', async () => {
    storage.getOldestFetchedAt.mockResolvedValue(undefined);

    await resyncKnownAccounts(storage as never, simplefin as never);

    expect(storage.saveOldestFetchedAt).toHaveBeenCalledWith(
      new Date(NOW.getTime() - MAX_SYNC_LOOKBACK_DAYS * DAY_MS),
    );
  });

  it('leaves an existing backfill cursor untouched by the normal sync itself', async () => {
    const cursor = new Date(NOW.getTime() - 10 * DAY_MS);
    storage.getOldestFetchedAt.mockResolvedValue(cursor);

    await resyncKnownAccounts(storage as never, simplefin as never);

    expect(storage.saveOldestFetchedAt).not.toHaveBeenCalled();
  });

  describe('dormant-gap backfill', () => {
    it('runs backfill chunks after the normal sync when the cursor is older than the ceiling', async () => {
      const cursor = new Date(NOW.getTime() - 200 * DAY_MS);
      storage.getOldestFetchedAt.mockResolvedValue(cursor);
      const expectedChunks = computeBackfillChunks(cursor, NOW);

      await resyncKnownAccounts(storage as never, simplefin as never);

      // Call 1 is the normal sync window; the rest are backfill chunks, oldest-cursor-first.
      expect(simplefin.fetchAccounts).toHaveBeenCalledTimes(1 + expectedChunks.length);
      expectedChunks.forEach((chunk, i) => {
        expect(simplefin.fetchAccounts).toHaveBeenNthCalledWith(
          i + 2,
          ACCESS_URL,
          chunk.startDate,
          chunk.endDate,
        );
      });
    });

    it('persists the cursor to each chunk start date as it progresses, so a later failure keeps earlier progress', async () => {
      const cursor = new Date(NOW.getTime() - 200 * DAY_MS);
      storage.getOldestFetchedAt.mockResolvedValue(cursor);
      const expectedChunks = computeBackfillChunks(cursor, NOW);

      await resyncKnownAccounts(storage as never, simplefin as never);

      expectedChunks.forEach((chunk) => {
        expect(storage.saveOldestFetchedAt).toHaveBeenCalledWith(chunk.startDate);
      });
    });

    it('saves progress made before a chunk fails, then rethrows', async () => {
      const cursor = new Date(NOW.getTime() - 200 * DAY_MS);
      storage.getOldestFetchedAt.mockResolvedValue(cursor);
      const [firstChunk] = computeBackfillChunks(cursor, NOW);
      simplefin.fetchAccounts
        .mockResolvedValueOnce([]) // normal sync
        .mockResolvedValueOnce([]) // first backfill chunk succeeds
        .mockRejectedValueOnce(new Error('bridge unavailable')); // second chunk fails

      await expect(resyncKnownAccounts(storage as never, simplefin as never)).rejects.toThrow(
        'bridge unavailable',
      );

      expect(storage.saveOldestFetchedAt).toHaveBeenCalledWith(firstChunk.startDate);
      expect(storage.saveOldestFetchedAt).toHaveBeenCalledTimes(1);
    });

    it('never chunks when allowBackfill is false, even with a long-dormant cursor', async () => {
      storage.getOldestFetchedAt.mockResolvedValue(new Date(NOW.getTime() - 200 * DAY_MS));

      await resyncKnownAccounts(storage as never, simplefin as never, false);

      expect(simplefin.fetchAccounts).toHaveBeenCalledTimes(1);
    });

    it('does not chunk when the cursor is within the normal-sync ceiling', async () => {
      storage.getOldestFetchedAt.mockResolvedValue(new Date(NOW.getTime() - 20 * DAY_MS));

      await resyncKnownAccounts(storage as never, simplefin as never);

      expect(simplefin.fetchAccounts).toHaveBeenCalledTimes(1);
    });
  });
});

describe('fetchNormalSyncWindow', () => {
  let storage: {
    getLastSyncedAt: ReturnType<typeof vi.fn>;
    getOldestFetchedAt: ReturnType<typeof vi.fn>;
    saveOldestFetchedAt: ReturnType<typeof vi.fn>;
  };
  let simplefin: { fetchAccounts: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    storage = {
      getLastSyncedAt: vi.fn().mockResolvedValue(undefined),
      getOldestFetchedAt: vi.fn().mockResolvedValue(undefined),
      saveOldestFetchedAt: vi.fn(),
    };
    simplefin = { fetchAccounts: vi.fn().mockResolvedValue(['synced-result'] as never) };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns whatever the adapter fetched, alongside the (possibly just-bootstrapped) cursor', async () => {
    const result = await fetchNormalSyncWindow(storage as never, simplefin as never, ACCESS_URL);

    expect(result).toEqual({
      synced: ['synced-result'],
      cursor: new Date(NOW.getTime() - MAX_SYNC_LOOKBACK_DAYS * DAY_MS),
    });
  });

  it('returns the already-stored cursor as-is when one exists, without re-bootstrapping it', async () => {
    const existingCursor = new Date(NOW.getTime() - 10 * DAY_MS);
    storage.getOldestFetchedAt.mockResolvedValue(existingCursor);

    const result = await fetchNormalSyncWindow(storage as never, simplefin as never, ACCESS_URL);

    expect(result.cursor).toEqual(existingCursor);
    expect(storage.saveOldestFetchedAt).not.toHaveBeenCalled();
  });

  it('uses the 40-day ceiling as start-date for a genuinely first-time connection', async () => {
    await fetchNormalSyncWindow(storage as never, simplefin as never, ACCESS_URL);

    expect(simplefin.fetchAccounts).toHaveBeenCalledWith(
      ACCESS_URL,
      new Date(NOW.getTime() - MAX_SYNC_LOOKBACK_DAYS * DAY_MS),
    );
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
      {
        account: { ...known, name: 'SimpleFIN Name', institutionName: 'SimpleFIN Bank', balance: 999 },
        transactions: [],
      },
    ]);

    expect(result.newAccounts).toEqual([]);
    expect(storage.upsertAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'acc-1',
        balance: 999,
        expectedSign: -1,
        dryFloor: 250,
        name: 'Checking',
        institutionName: 'Bank',
      }),
    );
  });
});
