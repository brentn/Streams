import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SimpleFinAdapter } from '../../core/simplefin/simplefin-adapter';
import { StorageRepository } from '../../core/storage/storage-repository';
import { ConnectAccount } from './connect-account';

describe('ConnectAccount', () => {
  let simplefin: {
    claimAccessUrl: ReturnType<typeof vi.fn>;
    fetchAccounts: ReturnType<typeof vi.fn>;
  };
  let storage: {
    getAccessUrl: ReturnType<typeof vi.fn>;
    saveAccessUrl: ReturnType<typeof vi.fn>;
    getAccounts: ReturnType<typeof vi.fn>;
    upsertAccount: ReturnType<typeof vi.fn>;
    upsertTransactions: ReturnType<typeof vi.fn>;
    getCategorizationRules: ReturnType<typeof vi.fn>;
    getLastSyncedAt: ReturnType<typeof vi.fn>;
    getOldestFetchedAt: ReturnType<typeof vi.fn>;
    saveOldestFetchedAt: ReturnType<typeof vi.fn>;
  };
  let router: { navigateByUrl: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    simplefin = { claimAccessUrl: vi.fn(), fetchAccounts: vi.fn() };
    storage = {
      getAccessUrl: vi.fn().mockResolvedValue(undefined),
      saveAccessUrl: vi.fn(),
      getAccounts: vi.fn().mockResolvedValue([]),
      upsertAccount: vi.fn(),
      upsertTransactions: vi.fn(),
      getCategorizationRules: vi.fn().mockResolvedValue([]),
      getLastSyncedAt: vi.fn().mockResolvedValue(undefined),
      getOldestFetchedAt: vi.fn().mockResolvedValue(new Date('2026-07-20T12:00:00Z')),
      saveOldestFetchedAt: vi.fn(),
    };
    router = { navigateByUrl: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [ConnectAccount],
      providers: [
        { provide: SimpleFinAdapter, useValue: simplefin },
        { provide: StorageRepository, useValue: storage },
        { provide: Router, useValue: router },
      ],
    }).compileComponents();
  });

  it('does nothing when the setup token is blank', async () => {
    const component = TestBed.createComponent(ConnectAccount).componentInstance;

    await component['connect']();

    expect(simplefin.claimAccessUrl).not.toHaveBeenCalled();
  });

  it('advances to the sign-confirmation step on a successful connect, without persisting anything yet', async () => {
    simplefin.claimAccessUrl.mockResolvedValue('https://user:pass@bridge.simplefin.org/simplefin');
    simplefin.fetchAccounts.mockResolvedValue([
      {
        account: {
          id: 'acc-1',
          name: 'Checking',
          institutionName: 'Bank',
          balance: 100,
          balanceDate: new Date(),
        },
        transactions: [],
      },
    ]);

    const component = TestBed.createComponent(ConnectAccount).componentInstance;
    component['setupToken'].set('dG9rZW4=');

    await component['connect']();

    expect(component['step']()).toBe('confirm-signs');
    expect(component['pendingAccounts']()).toHaveLength(1);
    expect(storage.saveAccessUrl).not.toHaveBeenCalled();
    expect(storage.upsertAccount).not.toHaveBeenCalled();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('fetches accounts with an explicit start-date rather than letting the adapter default it', async () => {
    simplefin.claimAccessUrl.mockResolvedValue('https://user:pass@bridge.simplefin.org/simplefin');
    simplefin.fetchAccounts.mockResolvedValue([]);

    const component = TestBed.createComponent(ConnectAccount).componentInstance;
    component['setupToken'].set('dG9rZW4=');

    await component['connect']();

    expect(simplefin.fetchAccounts).toHaveBeenCalledWith(
      'https://user:pass@bridge.simplefin.org/simplefin',
      expect.any(Date),
    );
  });

  it('surfaces an error message when the claim fails, staying on the connect step', async () => {
    simplefin.claimAccessUrl.mockRejectedValue(new Error('bad token'));

    const component = TestBed.createComponent(ConnectAccount).componentInstance;
    component['setupToken'].set('dG9rZW4=');

    await component['connect']();

    expect(component['errorMessage']()).toBe('bad token');
    expect(component['step']()).toBe('connect');
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  describe('reauthentication', () => {
    it('detects reauth mode from an already-stored Access URL', async () => {
      storage.getAccessUrl.mockResolvedValue('https://user:pass@bridge.simplefin.org/simplefin');

      const component = TestBed.createComponent(ConnectAccount).componentInstance;
      await Promise.resolve(); // let the constructor's getAccessUrl().then(...) settle

      expect(component['isReauth']()).toBe(true);
    });

    it('still saves the Access URL when a reauth response comes back with no accounts at all', async () => {
      simplefin.claimAccessUrl.mockResolvedValue('https://user:pass@bridge.simplefin.org/simplefin');
      simplefin.fetchAccounts.mockResolvedValue([]);

      const component = TestBed.createComponent(ConnectAccount).componentInstance;
      component['setupToken'].set('dG9rZW4=');

      await component['connect']();

      expect(storage.saveAccessUrl).toHaveBeenCalledWith(
        'https://user:pass@bridge.simplefin.org/simplefin',
      );
      expect(router.navigateByUrl).toHaveBeenCalledWith('/accounts');
    });

    it('resyncs a known account immediately and saves straight through when nothing is new', async () => {
      storage.getAccounts.mockResolvedValue([
        {
          id: 'acc-1',
          name: 'Checking',
          institutionName: 'Bank',
          balance: 50,
          balanceDate: new Date('2026-07-01'),
          expectedSign: 1,
          dryFloor: 100,
        },
      ]);
      simplefin.claimAccessUrl.mockResolvedValue('https://user:pass@bridge.simplefin.org/simplefin');
      simplefin.fetchAccounts.mockResolvedValue([
        {
          account: {
            id: 'acc-1',
            name: 'Checking',
            institutionName: 'Bank',
            balance: 500,
            balanceDate: new Date('2026-07-25'),
          },
          transactions: [],
        },
      ]);

      const component = TestBed.createComponent(ConnectAccount).componentInstance;
      component['setupToken'].set('dG9rZW4=');

      await component['connect']();

      expect(storage.saveAccessUrl).toHaveBeenCalledWith(
        'https://user:pass@bridge.simplefin.org/simplefin',
      );
      expect(storage.upsertAccount).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'acc-1', balance: 500, expectedSign: 1, dryFloor: 100 }),
      );
      expect(router.navigateByUrl).toHaveBeenCalledWith('/accounts');
      expect(component['step']()).toBe('connect'); // never advanced to sign confirmation
    });

    it('resyncs known accounts but still prompts sign confirmation for a genuinely new one', async () => {
      storage.getAccounts.mockResolvedValue([
        {
          id: 'acc-known',
          name: 'Checking',
          institutionName: 'Bank',
          balance: 50,
          balanceDate: new Date('2026-07-01'),
          expectedSign: 1,
          dryFloor: 0,
        },
      ]);
      simplefin.claimAccessUrl.mockResolvedValue('https://user:pass@bridge.simplefin.org/simplefin');
      simplefin.fetchAccounts.mockResolvedValue([
        {
          account: {
            id: 'acc-known',
            name: 'Checking',
            institutionName: 'Bank',
            balance: 500,
            balanceDate: new Date('2026-07-25'),
          },
          transactions: [],
        },
        {
          account: {
            id: 'acc-brand-new',
            name: 'Savings',
            institutionName: 'Bank',
            balance: 10,
            balanceDate: new Date('2026-07-25'),
          },
          transactions: [],
        },
      ]);

      const component = TestBed.createComponent(ConnectAccount).componentInstance;
      component['setupToken'].set('dG9rZW4=');

      await component['connect']();

      expect(storage.upsertAccount).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'acc-known', balance: 500 }),
      );
      expect(storage.saveAccessUrl).toHaveBeenCalledWith(
        'https://user:pass@bridge.simplefin.org/simplefin',
      );
      expect(component['step']()).toBe('confirm-signs');
      expect(component['pendingAccounts']().map((p) => p.account.id)).toEqual(['acc-brand-new']);
      expect(router.navigateByUrl).not.toHaveBeenCalled();
    });
  });

  describe('sign confirmation', () => {
    async function connectWithTwoAccounts() {
      simplefin.claimAccessUrl.mockResolvedValue(
        'https://user:pass@bridge.simplefin.org/simplefin',
      );
      simplefin.fetchAccounts.mockResolvedValue([
        {
          account: {
            id: 'acc-1',
            name: 'Checking',
            institutionName: 'Bank',
            balance: 100,
            balanceDate: new Date('2026-07-25'),
          },
          transactions: [],
        },
        {
          account: {
            id: 'acc-2',
            name: 'Credit Card',
            institutionName: 'Bank',
            balance: -50,
            balanceDate: new Date('2026-07-25'),
          },
          transactions: [
            {
              id: 't1',
              accountId: 'acc-2',
              date: new Date('2026-07-24'),
              amount: -10,
              description: 'x',
              matchedTarget: null,
            },
          ],
        },
      ]);

      const component = TestBed.createComponent(ConnectAccount).componentInstance;
      component['setupToken'].set('dG9rZW4=');
      await component['connect']();
      return component;
    }

    it('disables save until every account has a chosen sign', async () => {
      const component = await connectWithTwoAccounts();

      expect(component['allSignsChosen']()).toBe(false);

      component['chooseSign']('acc-1', 1);
      expect(component['allSignsChosen']()).toBe(false);

      component['chooseSign']('acc-2', -1);
      expect(component['allSignsChosen']()).toBe(true);
    });

    it('does not save when signs are incomplete', async () => {
      const component = await connectWithTwoAccounts();
      component['chooseSign']('acc-1', 1);

      await component['saveAndContinue']();

      expect(storage.upsertAccount).not.toHaveBeenCalled();
    });

    it('persists every account with its chosen sign and navigates to the multi-account view', async () => {
      const component = await connectWithTwoAccounts();
      component['chooseSign']('acc-1', 1);
      component['chooseSign']('acc-2', -1);

      await component['saveAndContinue']();

      expect(storage.saveAccessUrl).toHaveBeenCalledWith(
        'https://user:pass@bridge.simplefin.org/simplefin',
      );
      expect(storage.upsertAccount).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'acc-1', expectedSign: 1, dryFloor: 0 }),
      );
      expect(storage.upsertAccount).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'acc-2', expectedSign: -1, dryFloor: 0 }),
      );
      expect(storage.upsertTransactions).toHaveBeenCalledWith([
        {
          id: 't1',
          accountId: 'acc-2',
          date: new Date('2026-07-24'),
          amount: -10,
          description: 'x',
          matchedTarget: null,
        },
      ]);
      expect(router.navigateByUrl).toHaveBeenCalledWith('/accounts');
      expect(component['errorMessage']()).toBeNull();
    });
  });

  describe('backup import', () => {
    it('navigates to the accounts view once the shared backup-import component reports success', () => {
      const component = TestBed.createComponent(ConnectAccount).componentInstance;

      component['onBackupImported']();

      expect(router.navigateByUrl).toHaveBeenCalledWith('/accounts');
    });
  });
});
