import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isAutoResyncDue, SyncCoordinator } from './sync-coordinator';

/** Simulates the app tab regaining focus, the trigger `reauthorize`'s auto-retry listens for. */
function returnToTab(): void {
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

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
    getDirectCategorizations: ReturnType<typeof vi.fn>;
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
      getDirectCategorizations: vi.fn().mockResolvedValue([]),
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

  describe('reauthorize', () => {
    const needsReauthAccount = {
      id: 'acc-1',
      name: 'Checking',
      institutionName: 'Bank',
      balance: 1000,
      balanceDate: new Date('2026-07-25T00:00:00Z'),
      expectedSign: 1,
      dryFloor: 0,
      syncStatus: { kind: 'needs-reauth' as const },
    };

    beforeEach(() => {
      vi.stubGlobal('open', vi.fn());
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    });

    it('opens the SimpleFIN Bridge and attempts an immediate resync', async () => {
      await coordinator.reauthorize();

      expect(window.open).toHaveBeenCalledWith(
        'https://beta-bridge.simplefin.org/my-account',
        '_blank',
        'noopener,noreferrer',
      );
      expect(simplefin.fetchAccounts).toHaveBeenCalledOnce();
    });

    it('retries automatically when the tab becomes visible again while still needs-reauth', async () => {
      // The initial resync (fired before the user's done anything at the Bridge) still sees it.
      storage.getAccounts.mockResolvedValue([needsReauthAccount]);

      await coordinator.reauthorize();
      expect(simplefin.fetchAccounts).toHaveBeenCalledOnce();

      returnToTab();
      await new Promise((resolve) => setTimeout(resolve)); // let the fire-and-forget retry settle

      expect(simplefin.fetchAccounts).toHaveBeenCalledTimes(2);
    });

    it('stops retrying once a resync observes every account clear of needs-reauth', async () => {
      storage.getAccounts.mockResolvedValue([needsReauthAccount]);
      await coordinator.reauthorize();
      expect(coordinator.reauthPending()).toBe(true);

      // The user's fixed it at the Bridge by the time they return to this tab.
      storage.getAccounts.mockResolvedValue([{ ...needsReauthAccount, syncStatus: { kind: 'ok' } }]);
      returnToTab();
      await new Promise((resolve) => setTimeout(resolve));

      expect(coordinator.reauthPending()).toBe(false);
      expect(simplefin.fetchAccounts).toHaveBeenCalledTimes(2);

      returnToTab(); // an ordinary later tab-focus, now that it's resolved
      await new Promise((resolve) => setTimeout(resolve));

      expect(simplefin.fetchAccounts).toHaveBeenCalledTimes(2); // no further retry
    });

    it('does not resync on an ordinary tab focus when no Reauthorize is pending', async () => {
      returnToTab();
      await new Promise((resolve) => setTimeout(resolve));

      expect(simplefin.fetchAccounts).not.toHaveBeenCalled();
    });
  });
});
