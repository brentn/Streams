import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Account } from '../../core/models/account';
import { SCRUB_MAX_DAYS, SCRUB_MIN_DAYS } from '../../core/charting/date-window';
import { SimpleFinAdapter } from '../../core/simplefin/simplefin-adapter';
import { StorageRepository } from '../../core/storage/storage-repository';
import { AccountStream } from './account-stream';

// balanceDate is always "tomorrow" relative to test run time, so today's
// default scrub position (dayOffset 0) is deterministically actual/pre-balanceDate
// regardless of the machine's timezone or the date the suite runs on.
const account: Account = {
  id: 'acc-1',
  name: 'Checking',
  institutionName: 'Bank',
  balance: 1000,
  balanceDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
  expectedSign: 1,
  dryFloor: 0,
};

describe('AccountStream', () => {
  let storage: {
    getAccounts: ReturnType<typeof vi.fn>;
    getTransactionsForAccount: ReturnType<typeof vi.fn>;
    getFlowsForAccount: ReturnType<typeof vi.fn>;
    getTransfersForAccount: ReturnType<typeof vi.fn>;
    getAccessUrl: ReturnType<typeof vi.fn>;
    upsertAccount: ReturnType<typeof vi.fn>;
    upsertTransactions: ReturnType<typeof vi.fn>;
    getCategorizationRules: ReturnType<typeof vi.fn>;
    saveLastSyncedAt: ReturnType<typeof vi.fn>;
    getLastSyncedAt: ReturnType<typeof vi.fn>;
    getOldestFetchedAt: ReturnType<typeof vi.fn>;
    saveOldestFetchedAt: ReturnType<typeof vi.fn>;
  };
  let simplefin: { fetchAccounts: ReturnType<typeof vi.fn> };
  let router: { navigateByUrl: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    storage = {
      getAccounts: vi.fn().mockResolvedValue([account]),
      getTransactionsForAccount: vi.fn().mockResolvedValue([]),
      getFlowsForAccount: vi.fn().mockResolvedValue([]),
      getTransfersForAccount: vi.fn().mockResolvedValue([]),
      getAccessUrl: vi.fn(),
      upsertAccount: vi.fn(),
      upsertTransactions: vi.fn(),
      getCategorizationRules: vi.fn().mockResolvedValue([]),
      saveLastSyncedAt: vi.fn(),
      getLastSyncedAt: vi.fn().mockResolvedValue(undefined),
      getOldestFetchedAt: vi.fn().mockResolvedValue(new Date('2026-07-20T12:00:00Z')),
      saveOldestFetchedAt: vi.fn(),
    };
    simplefin = { fetchAccounts: vi.fn() };
    router = { navigateByUrl: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [AccountStream],
      providers: [
        { provide: StorageRepository, useValue: storage },
        { provide: SimpleFinAdapter, useValue: simplefin },
        { provide: Router, useValue: router },
      ],
    }).compileComponents();
  });

  it('loads the matching account and its transactions', async () => {
    const fixture = TestBed.createComponent(AccountStream);
    const component = fixture.componentInstance;

    await component['load']('acc-1');

    expect(component['account']()).toEqual(account);
    expect(component['balance']()).toBe(1000);
    expect(component['isActual']()).toBe(true);
  });

  it('loads Transfers for the account alongside its Flows', async () => {
    const fixture = TestBed.createComponent(AccountStream);
    const component = fixture.componentInstance;

    await component['load']('acc-1');

    expect(storage.getTransfersForAccount).toHaveBeenCalledWith('acc-1');
    expect(component['transfers']()).toEqual([]);
  });

  it('leaves the account unset when no account matches the id', async () => {
    const fixture = TestBed.createComponent(AccountStream);
    const component = fixture.componentInstance;

    await component['load']('missing');

    expect(component['account']()).toBeNull();
    expect(component['balance']()).toBeNull();
  });

  it('clamps day offset shifts within the scrub bounds', () => {
    const fixture = TestBed.createComponent(AccountStream);
    const component = fixture.componentInstance;

    component['dayOffset'].set(SCRUB_MAX_DAYS);
    component['shiftDay'](1);
    expect(component['dayOffset']()).toBe(SCRUB_MAX_DAYS);

    component['dayOffset'].set(SCRUB_MIN_DAYS);
    component['shiftDay'](-1);
    expect(component['dayOffset']()).toBe(SCRUB_MIN_DAYS);
  });

  it('re-syncs by fetching accounts and re-loading from storage', async () => {
    storage.getAccessUrl.mockResolvedValue('https://user:pass@bridge.simplefin.org/simplefin');
    simplefin.fetchAccounts.mockResolvedValue([{ account, transactions: [] }]);

    const fixture = TestBed.createComponent(AccountStream);
    fixture.componentRef.setInput('id', 'acc-1');
    const component = fixture.componentInstance;

    await component['resync']();

    expect(storage.upsertAccount).toHaveBeenCalledWith(account);
    expect(component['isSyncing']()).toBe(false);
    expect(component['operationError']()).toBeNull();
  });

  it('surfaces an error when re-syncing without a stored access URL', async () => {
    storage.getAccessUrl.mockResolvedValue(undefined);

    const fixture = TestBed.createComponent(AccountStream);
    fixture.componentRef.setInput('id', 'acc-1');
    const component = fixture.componentInstance;

    await component['resync']();

    expect(component['operationError']()).toBe('No SimpleFIN connection found.');
  });

  describe('sync status banner', () => {
    it('shows a serious, Reconnect-labeled banner when the account needs reauthentication', async () => {
      storage.getAccounts.mockResolvedValue([
        { ...account, syncStatus: { kind: 'needs-reauth' } },
      ]);

      const fixture = TestBed.createComponent(AccountStream);
      const component = fixture.componentInstance;
      await component['load']('acc-1');

      expect(component['banner']()).toEqual({
        message: 'Your SimpleFIN connection needs to be reconnected.',
        severity: 'serious',
        retryLabel: 'Reconnect',
      });
    });

    it('navigates to the connect flow, rather than resyncing, when the banner action fires for needs-reauth', async () => {
      storage.getAccounts.mockResolvedValue([
        { ...account, syncStatus: { kind: 'needs-reauth' } },
      ]);

      const fixture = TestBed.createComponent(AccountStream);
      const component = fixture.componentInstance;
      await component['load']('acc-1');

      component['onBannerAction']();

      expect(router.navigateByUrl).toHaveBeenCalledWith('/connect');
      expect(simplefin.fetchAccounts).not.toHaveBeenCalled();
    });

    it('shows a warning banner with the sync-issue message', async () => {
      storage.getAccounts.mockResolvedValue([
        { ...account, syncStatus: { kind: 'sync-issue', message: 'Try again later.' } },
      ]);

      const fixture = TestBed.createComponent(AccountStream);
      const component = fixture.componentInstance;
      await component['load']('acc-1');

      expect(component['banner']()).toEqual({
        message: 'Try again later.',
        severity: 'warning',
        retryLabel: 'Retry',
      });
    });

    it('lets a transient operation error take priority over a persisted needs-reauth status', async () => {
      storage.getAccessUrl.mockResolvedValue(undefined);
      storage.getAccounts.mockResolvedValue([
        { ...account, syncStatus: { kind: 'needs-reauth' } },
      ]);

      const fixture = TestBed.createComponent(AccountStream);
      fixture.componentRef.setInput('id', 'acc-1');
      const component = fixture.componentInstance;
      await component['load']('acc-1');
      await component['resync'](); // fails with no access URL -> operationError set

      expect(component['banner']().severity).toBe('critical');
      expect(component['banner']().message).toBe('No SimpleFIN connection found.');
    });
  });

  describe('Dry Floor', () => {
    it('syncs the input from the loaded account and starts clean', async () => {
      const fixture = TestBed.createComponent(AccountStream);
      const component = fixture.componentInstance;

      await component['load']('acc-1');

      expect(component['dryFloorInput']()).toBe(0);
      expect(component['dryFloorDirty']()).toBe(false);
    });

    it('flags the input dirty once it diverges from the stored value', async () => {
      const fixture = TestBed.createComponent(AccountStream);
      const component = fixture.componentInstance;

      await component['load']('acc-1');
      component['dryFloorInput'].set(200);

      expect(component['dryFloorDirty']()).toBe(true);
    });

    it('persists the new Dry Floor and clears dirty state', async () => {
      const fixture = TestBed.createComponent(AccountStream);
      const component = fixture.componentInstance;

      await component['load']('acc-1');
      component['dryFloorInput'].set(200);

      await component['saveDryFloor']();

      expect(storage.upsertAccount).toHaveBeenCalledWith({ ...account, dryFloor: 200 });
      expect(component['account']()?.dryFloor).toBe(200);
      expect(component['dryFloorDirty']()).toBe(false);
    });

    it('does not flag dirty, and refuses to save, when the input is cleared to NaN', async () => {
      const fixture = TestBed.createComponent(AccountStream);
      const component = fixture.componentInstance;

      await component['load']('acc-1');
      component['dryFloorInput'].set(NaN);

      expect(component['dryFloorDirty']()).toBe(false);

      await component['saveDryFloor']();
      expect(storage.upsertAccount).not.toHaveBeenCalled();
    });

    it('normalizes a pre-migration account with no stored dryFloor to 0', async () => {
      const { dryFloor: _dryFloor, ...legacyAccount } = account;
      storage.getAccounts.mockResolvedValue([legacyAccount as Account]);

      const fixture = TestBed.createComponent(AccountStream);
      const component = fixture.componentInstance;

      await component['load']('acc-1');

      expect(component['account']()?.dryFloor).toBe(0);
      expect(component['dryFloorInput']()).toBe(0);
    });

    it('reports no Running-Dry Alert when the projection never crosses the Dry Floor', async () => {
      const fixture = TestBed.createComponent(AccountStream);
      const component = fixture.componentInstance;

      await component['load']('acc-1');

      expect(component['dryAlert']()).toBeNull();
    });

    it('reports a Running-Dry Alert when the projected balance is already at or below the Dry Floor', async () => {
      const belowFloor: Account = { ...account, dryFloor: 2000 };
      storage.getAccounts.mockResolvedValue([belowFloor]);

      const fixture = TestBed.createComponent(AccountStream);
      const component = fixture.componentInstance;

      await component['load']('acc-1');

      expect(component['dryAlert']()).toEqual(expect.objectContaining({ balance: 1000 }));
    });
  });
});
