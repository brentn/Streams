import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Account } from '../../core/models/account';
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
};

describe('AccountStream', () => {
  let storage: {
    getAccounts: ReturnType<typeof vi.fn>;
    getTransactionsForAccount: ReturnType<typeof vi.fn>;
    getAccessUrl: ReturnType<typeof vi.fn>;
    upsertAccount: ReturnType<typeof vi.fn>;
    upsertTransactions: ReturnType<typeof vi.fn>;
  };
  let simplefin: { fetchAccounts: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    storage = {
      getAccounts: vi.fn().mockResolvedValue([account]),
      getTransactionsForAccount: vi.fn().mockResolvedValue([]),
      getAccessUrl: vi.fn(),
      upsertAccount: vi.fn(),
      upsertTransactions: vi.fn(),
    };
    simplefin = { fetchAccounts: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [AccountStream],
      providers: [
        { provide: StorageRepository, useValue: storage },
        { provide: SimpleFinAdapter, useValue: simplefin },
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

    component['dayOffset'].set(component['scrubMax']);
    component['shiftDay'](1);
    expect(component['dayOffset']()).toBe(component['scrubMax']);

    component['dayOffset'].set(component['scrubMin']);
    component['shiftDay'](-1);
    expect(component['dayOffset']()).toBe(component['scrubMin']);
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
    expect(component['errorMessage']()).toBeNull();
  });

  it('surfaces an error when re-syncing without a stored access URL', async () => {
    storage.getAccessUrl.mockResolvedValue(undefined);

    const fixture = TestBed.createComponent(AccountStream);
    fixture.componentRef.setInput('id', 'acc-1');
    const component = fixture.componentInstance;

    await component['resync']();

    expect(component['errorMessage']()).toBe('No SimpleFIN connection found.');
  });
});
