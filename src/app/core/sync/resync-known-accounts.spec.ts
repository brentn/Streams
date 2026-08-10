import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Account } from '../models/account';
import { SimpleFinAuthError } from '../simplefin/simplefin-adapter';
import { computeBackfillChunks, computeNormalSyncStartDate, MAX_SYNC_LOOKBACK_DAYS } from './sync-window';
import {
  fetchNormalSyncWindow,
  reconcileOrphanedAccounts,
  reconcileSyncedAccounts,
  resyncKnownAccounts,
} from './resync-known-accounts';

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
    reidAccount: ReturnType<typeof vi.fn>;
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
      reidAccount: vi.fn(),
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

  it('re-anchors a healthy cursor forward to now, so elapsed time alone never manufactures a gap', async () => {
    const cursor = new Date(NOW.getTime() - 10 * DAY_MS);
    storage.getOldestFetchedAt.mockResolvedValue(cursor);

    await resyncKnownAccounts(storage as never, simplefin as never);

    expect(storage.saveOldestFetchedAt).toHaveBeenCalledWith(NOW);
  });

  describe('dormant-gap backfill', () => {
    // With `getLastSyncedAt` undefined (the default in this suite), the normal sync's own start
    // date is the 40-day ceiling — the near edge every one of these gaps is measured against.
    const normalSyncStartDate = new Date(NOW.getTime() - MAX_SYNC_LOOKBACK_DAYS * DAY_MS);

    it('runs backfill chunks after the normal sync when the cursor is older than the ceiling', async () => {
      const cursor = new Date(NOW.getTime() - 200 * DAY_MS);
      storage.getOldestFetchedAt.mockResolvedValue(cursor);
      const expectedChunks = computeBackfillChunks(cursor, normalSyncStartDate);

      await resyncKnownAccounts(storage as never, simplefin as never);

      // Call 1 is the normal sync window; the rest are backfill chunks, newest-first, clipped at the cursor.
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

    it('persists the cursor to each chunk end date as it progresses forward, so a later failure keeps earlier progress', async () => {
      const cursor = new Date(NOW.getTime() - 200 * DAY_MS);
      storage.getOldestFetchedAt.mockResolvedValue(cursor);
      const expectedChunks = computeBackfillChunks(cursor, normalSyncStartDate);

      await resyncKnownAccounts(storage as never, simplefin as never);

      expectedChunks.forEach((chunk) => {
        expect(storage.saveOldestFetchedAt).toHaveBeenCalledWith(chunk.endDate);
      });
    });

    it('re-anchors the cursor to now once the last chunk closes the gap exactly at the normal-sync start date', async () => {
      const cursor = new Date(NOW.getTime() - 200 * DAY_MS);
      storage.getOldestFetchedAt.mockResolvedValue(cursor);

      await resyncKnownAccounts(storage as never, simplefin as never);

      expect(storage.saveOldestFetchedAt).toHaveBeenLastCalledWith(NOW);
    });

    it('produces zero backfill requests on the next manual resync once the gap has closed', async () => {
      const cursor = new Date(NOW.getTime() - 200 * DAY_MS);
      storage.getOldestFetchedAt.mockResolvedValue(cursor);

      await resyncKnownAccounts(storage as never, simplefin as never); // closes the gap, re-anchors to NOW
      simplefin.fetchAccounts.mockClear();
      storage.getOldestFetchedAt.mockResolvedValue(NOW); // the re-anchored cursor from the call above

      await resyncKnownAccounts(storage as never, simplefin as never);

      expect(simplefin.fetchAccounts).toHaveBeenCalledTimes(1); // normal sync only, no chunks
    });

    it('produces zero backfill requests on a later manual resync once closed, even once lastSyncedAt has genuinely moved on', async () => {
      // Mirrors what SyncCoordinator actually does in production: it saves lastSyncedAt after
      // every successful resync, so a real second click sees normalSyncStartDate shrink toward
      // lastSyncedAt-3days rather than staying pinned at the 40-day ceiling.
      const cursor = new Date(NOW.getTime() - 200 * DAY_MS);
      storage.getOldestFetchedAt.mockResolvedValue(cursor);

      await resyncKnownAccounts(storage as never, simplefin as never); // closes the gap, re-anchors to NOW
      simplefin.fetchAccounts.mockClear();
      storage.getOldestFetchedAt.mockResolvedValue(NOW); // the re-anchored cursor from the call above
      storage.getLastSyncedAt.mockResolvedValue(NOW); // SyncCoordinator would have saved this after the call above
      vi.setSystemTime(new Date(NOW.getTime() + 3 * DAY_MS)); // a later click, not an immediate repeat

      await resyncKnownAccounts(storage as never, simplefin as never);

      expect(simplefin.fetchAccounts).toHaveBeenCalledTimes(1); // normal sync only, no chunks
    });

    it('resumes forward from a capped call on an immediate repeat click, never regressing behind the original cursor', async () => {
      const cursor = new Date(NOW.getTime() - 5000 * DAY_MS); // far wider than one resync's 10-chunk cap can close
      storage.getOldestFetchedAt.mockResolvedValue(cursor);

      await resyncKnownAccounts(storage as never, simplefin as never);
      const progressAfterFirstClick = storage.saveOldestFetchedAt.mock.calls.at(-1)![0] as Date;
      expect(progressAfterFirstClick.getTime()).toBeGreaterThan(cursor.getTime()); // capped, not fully closed
      expect(progressAfterFirstClick.getTime()).toBeLessThan(normalSyncStartDate.getTime()); // not closed yet either

      simplefin.fetchAccounts.mockClear();
      storage.saveOldestFetchedAt.mockClear();
      storage.getOldestFetchedAt.mockResolvedValue(progressAfterFirstClick); // an "immediate" second click

      await resyncKnownAccounts(storage as never, simplefin as never);
      const progressAfterSecondClick = storage.saveOldestFetchedAt.mock.calls.at(-1)![0] as Date;

      // Every save this click landed at or ahead of where the first click left off — it kept
      // closing the same gap forward, rather than restarting and re-covering the same slice.
      for (const [savedCursor] of storage.saveOldestFetchedAt.mock.calls as [Date][]) {
        expect(savedCursor.getTime()).toBeGreaterThanOrEqual(progressAfterFirstClick.getTime());
      }
      expect(progressAfterSecondClick.getTime()).toBeGreaterThan(progressAfterFirstClick.getTime());
    });

    it('saves progress made before a chunk fails, then rethrows', async () => {
      const cursor = new Date(NOW.getTime() - 200 * DAY_MS);
      storage.getOldestFetchedAt.mockResolvedValue(cursor);
      const [firstChunk] = computeBackfillChunks(cursor, normalSyncStartDate);
      simplefin.fetchAccounts
        .mockResolvedValueOnce([]) // normal sync
        .mockResolvedValueOnce([]) // first backfill chunk succeeds
        .mockRejectedValueOnce(new Error('bridge unavailable')); // second chunk fails

      await expect(resyncKnownAccounts(storage as never, simplefin as never)).rejects.toThrow(
        'bridge unavailable',
      );

      expect(storage.saveOldestFetchedAt).toHaveBeenCalledWith(firstChunk.endDate);
      expect(storage.saveOldestFetchedAt).toHaveBeenCalledTimes(1);
    });

    it('never chunks when allowBackfill is false, even with a long-dormant cursor', async () => {
      storage.getOldestFetchedAt.mockResolvedValue(new Date(NOW.getTime() - 200 * DAY_MS));

      await resyncKnownAccounts(storage as never, simplefin as never, false);

      expect(simplefin.fetchAccounts).toHaveBeenCalledTimes(1);
    });

    it('leaves the cursor untouched when allowBackfill is false and a real gap exists, deferring to a future manual resync', async () => {
      const cursor = new Date(NOW.getTime() - 200 * DAY_MS);
      storage.getOldestFetchedAt.mockResolvedValue(cursor);

      await resyncKnownAccounts(storage as never, simplefin as never, false);

      expect(storage.saveOldestFetchedAt).not.toHaveBeenCalled();
    });

    it('does not chunk when the cursor is within the normal-sync ceiling', async () => {
      storage.getOldestFetchedAt.mockResolvedValue(new Date(NOW.getTime() - 20 * DAY_MS));

      await resyncKnownAccounts(storage as never, simplefin as never);

      expect(simplefin.fetchAccounts).toHaveBeenCalledTimes(1);
    });
  });

  describe('needs-reauth recovery', () => {
    // A connection recovering from Needs Reauthentication has no continuous prior coverage to
    // backfill toward, same as a brand-new account — it resyncs from the Sync Floor only,
    // regardless of how stale `lastSyncedAt` or the backfill cursor happen to be (ADR-0013).
    const syncFloor = new Date(NOW.getTime() - MAX_SYNC_LOOKBACK_DAYS * DAY_MS);

    beforeEach(() => {
      storage.getAccounts.mockResolvedValue([{ ...known, syncStatus: { kind: 'needs-reauth' } }]);
    });

    it('fetches the normal sync window from the Sync Floor, ignoring a recent-looking lastSyncedAt', async () => {
      // lastSyncedAt only looks recent because a failed daily auto-resync attempt during the
      // outage bumped it — it does not reflect an actual successful sync.
      storage.getLastSyncedAt.mockResolvedValue(new Date(NOW.getTime() - 1 * DAY_MS));

      await resyncKnownAccounts(storage as never, simplefin as never);

      expect(simplefin.fetchAccounts).toHaveBeenNthCalledWith(1, ACCESS_URL, syncFloor);
    });

    it('produces zero backfill requests even with a long-dormant cursor', async () => {
      storage.getOldestFetchedAt.mockResolvedValue(new Date(NOW.getTime() - 400 * DAY_MS));

      await resyncKnownAccounts(storage as never, simplefin as never);

      expect(simplefin.fetchAccounts).toHaveBeenCalledTimes(1); // normal sync only, no chunks
    });

    it('re-anchors the cursor to now after a successful recovery sync', async () => {
      storage.getOldestFetchedAt.mockResolvedValue(new Date(NOW.getTime() - 400 * DAY_MS));

      await resyncKnownAccounts(storage as never, simplefin as never);

      expect(storage.saveOldestFetchedAt).toHaveBeenCalledWith(NOW);
    });

    it('does not force the Sync Floor for a healthy connection with no needs-reauth accounts', async () => {
      storage.getAccounts.mockResolvedValue([known]); // no syncStatus at all
      storage.getLastSyncedAt.mockResolvedValue(new Date(NOW.getTime() - 1 * DAY_MS));

      await resyncKnownAccounts(storage as never, simplefin as never);

      const expectedStartDate = computeNormalSyncStartDate(new Date(NOW.getTime() - 1 * DAY_MS), NOW);
      expect(expectedStartDate.getTime()).not.toBe(syncFloor.getTime());
      expect(simplefin.fetchAccounts).toHaveBeenNthCalledWith(1, ACCESS_URL, expectedStartDate);
    });

    it('does not force the Sync Floor when only one of several accounts is stuck in needs-reauth', async () => {
      // A per-account SimpleFIN error (`classifySyncStatus`) can leave a single account stuck in
      // Needs Reauthentication while the rest of the connection stays healthy — that's not the
      // connection-wide outage this recovery treatment exists for, and must not suppress real
      // Dormant-Gap detection for the other, unrelated accounts indefinitely.
      const otherAccount = { ...known, id: 'acc-2', syncStatus: { kind: 'ok' as const } };
      storage.getAccounts.mockResolvedValue([
        { ...known, syncStatus: { kind: 'needs-reauth' as const } },
        otherAccount,
      ]);
      storage.getLastSyncedAt.mockResolvedValue(new Date(NOW.getTime() - 1 * DAY_MS));

      await resyncKnownAccounts(storage as never, simplefin as never);

      const expectedStartDate = computeNormalSyncStartDate(new Date(NOW.getTime() - 1 * DAY_MS), NOW);
      expect(expectedStartDate.getTime()).not.toBe(syncFloor.getTime());
      expect(simplefin.fetchAccounts).toHaveBeenNthCalledWith(1, ACCESS_URL, expectedStartDate);
    });

    it('re-keys an account SimpleFIN returns under a new id, matched by name + institutionName against the needs-reauth account', async () => {
      const reissued = { ...known, id: 'acc-reissued', balance: 999 };
      simplefin.fetchAccounts.mockResolvedValue([{ account: reissued, transactions: [] }]);

      await resyncKnownAccounts(storage as never, simplefin as never);

      expect(storage.reidAccount).toHaveBeenCalledWith(
        'acc-1',
        expect.objectContaining({ id: 'acc-reissued', balance: 999, name: 'Checking', institutionName: 'Bank' }),
      );
    });

    it('never re-keys during an ordinary (non-recovery) resync, even with an id mismatch', async () => {
      storage.getAccounts.mockResolvedValue([known]); // healthy — no syncStatus at all
      const reissued = { ...known, id: 'acc-reissued', balance: 999 };
      simplefin.fetchAccounts.mockResolvedValue([{ account: reissued, transactions: [] }]);

      await resyncKnownAccounts(storage as never, simplefin as never);

      expect(storage.reidAccount).not.toHaveBeenCalled();
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
      normalSyncStartDate: new Date(NOW.getTime() - MAX_SYNC_LOOKBACK_DAYS * DAY_MS),
      now: NOW,
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

describe('reconcileOrphanedAccounts', () => {
  let storage: {
    getAccounts: ReturnType<typeof vi.fn>;
    getCategorizationRules: ReturnType<typeof vi.fn>;
    reidAccount: ReturnType<typeof vi.fn>;
    upsertTransactions: ReturnType<typeof vi.fn>;
  };

  const needsReauthAccount: Account = { ...known, syncStatus: { kind: 'needs-reauth' } };
  const orphan = {
    account: {
      id: 'acc-reissued',
      name: known.name,
      institutionName: known.institutionName,
      balance: 999,
      balanceDate: new Date('2026-07-29'),
    },
    transactions: [],
  };

  beforeEach(() => {
    storage = {
      getAccounts: vi.fn().mockResolvedValue([needsReauthAccount]),
      getCategorizationRules: vi.fn().mockResolvedValue([]),
      reidAccount: vi.fn(),
      upsertTransactions: vi.fn(),
    };
  });

  it('re-keys an unambiguous match by name + institutionName, preserving the locally-owned fields', async () => {
    await reconcileOrphanedAccounts(storage as never, [orphan]);

    expect(storage.reidAccount).toHaveBeenCalledWith(
      'acc-1',
      expect.objectContaining({
        id: 'acc-reissued',
        balance: 999,
        name: known.name,
        institutionName: known.institutionName,
        expectedSign: known.expectedSign,
        dryFloor: known.dryFloor,
      }),
    );
  });

  it('upserts the orphaned account’s transactions through the current Categorization Rules', async () => {
    const transactions = [
      {
        id: 't1',
        accountId: 'acc-reissued',
        date: new Date('2026-07-24'),
        amount: -10,
        description: 'COFFEE SHOP',
        matchedTarget: null,
      },
    ];
    storage.getCategorizationRules.mockResolvedValue([
      { matchText: 'coffee shop', target: { kind: 'flow', id: 'flow-coffee' } },
    ]);

    await reconcileOrphanedAccounts(storage as never, [{ ...orphan, transactions }]);

    expect(storage.upsertTransactions).toHaveBeenCalledWith([
      { ...transactions[0], matchedTarget: { kind: 'flow', id: 'flow-coffee' } },
    ]);
  });

  it('does nothing when no needs-reauth account shares the name', async () => {
    storage.getAccounts.mockResolvedValue([{ ...needsReauthAccount, name: 'Some Other Account' }]);

    await reconcileOrphanedAccounts(storage as never, [orphan]);

    expect(storage.reidAccount).not.toHaveBeenCalled();
  });

  it('does nothing when the name matches but institutionName does not', async () => {
    storage.getAccounts.mockResolvedValue([{ ...needsReauthAccount, institutionName: 'A Different Bank' }]);

    await reconcileOrphanedAccounts(storage as never, [orphan]);

    expect(storage.reidAccount).not.toHaveBeenCalled();
  });

  it('does nothing when more than one needs-reauth account shares the same name + institutionName — ambiguous', async () => {
    storage.getAccounts.mockResolvedValue([
      needsReauthAccount,
      { ...needsReauthAccount, id: 'acc-2' },
    ]);

    await reconcileOrphanedAccounts(storage as never, [orphan]);

    expect(storage.reidAccount).not.toHaveBeenCalled();
  });

  it('ignores a same-named account that is not currently needs-reauth', async () => {
    storage.getAccounts.mockResolvedValue([{ ...known, syncStatus: { kind: 'ok' } }]);

    await reconcileOrphanedAccounts(storage as never, [orphan]);

    expect(storage.reidAccount).not.toHaveBeenCalled();
  });

  it('depletes a matched candidate so a second orphaned item cannot also claim it', async () => {
    const secondOrphan = { ...orphan, account: { ...orphan.account, id: 'acc-reissued-2' } };

    await reconcileOrphanedAccounts(storage as never, [orphan, secondOrphan]);

    expect(storage.reidAccount).toHaveBeenCalledTimes(1);
    expect(storage.reidAccount).toHaveBeenCalledWith('acc-1', expect.objectContaining({ id: 'acc-reissued' }));
  });

  it('does nothing and reads nothing from storage for an empty orphaned list', async () => {
    await reconcileOrphanedAccounts(storage as never, []);

    expect(storage.getAccounts).not.toHaveBeenCalled();
    expect(storage.reidAccount).not.toHaveBeenCalled();
    expect(storage.upsertTransactions).not.toHaveBeenCalled();
  });
});
