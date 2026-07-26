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
    saveAccessUrl: ReturnType<typeof vi.fn>;
    upsertAccount: ReturnType<typeof vi.fn>;
    upsertTransactions: ReturnType<typeof vi.fn>;
  };
  let router: { navigateByUrl: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    simplefin = { claimAccessUrl: vi.fn(), fetchAccounts: vi.fn() };
    storage = {
      saveAccessUrl: vi.fn(),
      upsertAccount: vi.fn(),
      upsertTransactions: vi.fn(),
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

  it('claims, saves, syncs, and navigates to the first account on success', async () => {
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
          balanceDate: new Date(),
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
    expect(storage.upsertAccount).toHaveBeenCalledWith(expect.objectContaining({ id: 'acc-1' }));
    expect(router.navigateByUrl).toHaveBeenCalledWith('/accounts/acc-1');
    expect(component['errorMessage']()).toBeNull();
  });

  it('surfaces an error message when the claim fails', async () => {
    simplefin.claimAccessUrl.mockRejectedValue(new Error('bad token'));

    const component = TestBed.createComponent(ConnectAccount).componentInstance;
    component['setupToken'].set('dG9rZW4=');

    await component['connect']();

    expect(component['errorMessage']()).toBe('bad token');
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });
});
