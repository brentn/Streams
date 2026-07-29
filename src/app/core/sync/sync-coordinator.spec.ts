import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isAutoResyncDue, SyncCoordinator } from './sync-coordinator';

describe('isAutoResyncDue', () => {
  const now = new Date('2026-07-25T12:00:00Z');

  it('is due when never synced before', () => {
    expect(isAutoResyncDue(undefined, now)).toBe(true);
  });

  it('is not due when synced less than 24h ago', () => {
    expect(isAutoResyncDue(new Date('2026-07-25T00:00:01Z'), now)).toBe(false);
  });

  it('is due once at least 24h have passed since the last sync', () => {
    expect(isAutoResyncDue(new Date('2026-07-24T12:00:00Z'), now)).toBe(true);
    expect(isAutoResyncDue(new Date('2026-07-24T11:59:59Z'), now)).toBe(true);
  });
});

describe('SyncCoordinator', () => {
  let storage: {
    getAccessUrl: ReturnType<typeof vi.fn>;
    getLastSyncedAt: ReturnType<typeof vi.fn>;
    saveLastSyncedAt: ReturnType<typeof vi.fn>;
    getAccounts: ReturnType<typeof vi.fn>;
    getCategorizationRules: ReturnType<typeof vi.fn>;
    getOldestFetchedAt: ReturnType<typeof vi.fn>;
    saveOldestFetchedAt: ReturnType<typeof vi.fn>;
  };
  let simplefin: { fetchAccounts: ReturnType<typeof vi.fn> };
  let coordinator: SyncCoordinator;

  beforeEach(() => {
    storage = {
      getAccessUrl: vi.fn().mockResolvedValue('https://user:pass@bridge.simplefin.org/simplefin'),
      getLastSyncedAt: vi.fn().mockResolvedValue(undefined),
      saveLastSyncedAt: vi.fn(),
      getAccounts: vi.fn().mockResolvedValue([]),
      getCategorizationRules: vi.fn().mockResolvedValue([]),
      getOldestFetchedAt: vi.fn().mockResolvedValue(new Date('2026-07-20T12:00:00Z')),
      saveOldestFetchedAt: vi.fn(),
    };
    simplefin = { fetchAccounts: vi.fn().mockResolvedValue([]) };
    coordinator = new SyncCoordinator(storage as never, simplefin as never);
  });

  describe('triggerAutoResyncIfDue', () => {
    it('does nothing when there is no stored SimpleFIN connection', async () => {
      storage.getAccessUrl.mockResolvedValue(undefined);
      const resync = vi.spyOn(coordinator, 'resync');

      await coordinator.triggerAutoResyncIfDue();

      expect(resync).not.toHaveBeenCalled();
    });

    it('resyncs when never synced before', async () => {
      const resync = vi.spyOn(coordinator, 'resync').mockResolvedValue();

      await coordinator.triggerAutoResyncIfDue();

      expect(resync).toHaveBeenCalledOnce();
    });

    it('does not resync when the daily throttle has not elapsed', async () => {
      storage.getLastSyncedAt.mockResolvedValue(new Date());
      const resync = vi.spyOn(coordinator, 'resync').mockResolvedValue();

      await coordinator.triggerAutoResyncIfDue();

      expect(resync).not.toHaveBeenCalled();
    });

    it('only checks once, even if called again later', async () => {
      const resync = vi.spyOn(coordinator, 'resync').mockResolvedValue();

      await coordinator.triggerAutoResyncIfDue();
      storage.getLastSyncedAt.mockResolvedValue(undefined); // still "due" by the throttle...
      await coordinator.triggerAutoResyncIfDue(); // ...but shouldn't check again

      expect(resync).toHaveBeenCalledOnce();
    });
  });

  describe('resync', () => {
    it('tracks isSyncing across the call and clears a previous operation error', async () => {
      let resolveFetch!: () => void;
      simplefin = {
        fetchAccounts: vi.fn(
          () =>
            new Promise((resolve) => {
              resolveFetch = () => resolve([]);
            }),
        ),
      };
      coordinator = new SyncCoordinator(storage as never, simplefin as never);
      coordinator.operationError.set('stale error');

      const promise = coordinator.resync();
      expect(coordinator.isSyncing()).toBe(true);
      expect(coordinator.operationError()).toBeNull();

      await new Promise((resolve) => setTimeout(resolve)); // let resyncKnownAccounts reach fetchAccounts
      resolveFetch();
      await promise;

      expect(coordinator.isSyncing()).toBe(false);
    });

    it('saves the last-synced timestamp on success', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-25T12:00:00Z'));

      await coordinator.resync();

      expect(storage.saveLastSyncedAt).toHaveBeenCalledWith(new Date('2026-07-25T12:00:00Z'));
      vi.useRealTimers();
    });

    it('surfaces a failure as operationError without saving a last-synced timestamp', async () => {
      const failingStorage = {
        ...storage,
        getAccessUrl: vi.fn().mockResolvedValue(undefined), // resyncKnownAccounts throws with no access URL
      };
      coordinator = new SyncCoordinator(failingStorage as never, simplefin as never);

      await coordinator.resync();

      expect(coordinator.operationError()).toBe('No SimpleFIN connection found.');
      expect(coordinator.isSyncing()).toBe(false);
      expect(failingStorage.saveLastSyncedAt).not.toHaveBeenCalled();
    });
  });

  describe('backfill gating', () => {
    const dormantCursor = new Date('2026-01-01T00:00:00Z'); // well over 40 days before "now"

    it('never runs a dormant-gap backfill from auto-resync, even with a long-dormant cursor', async () => {
      storage.getOldestFetchedAt.mockResolvedValue(dormantCursor);

      await coordinator.triggerAutoResyncIfDue();

      expect(simplefin.fetchAccounts).toHaveBeenCalledOnce(); // normal sync window only, no chunks
    });

    it('runs a dormant-gap backfill from manual resync when the cursor is long-dormant', async () => {
      storage.getOldestFetchedAt.mockResolvedValue(dormantCursor);

      await coordinator.resync();

      expect(simplefin.fetchAccounts.mock.calls.length).toBeGreaterThan(1);
    });
  });
});
