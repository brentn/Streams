import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StorageRepository } from '../storage/storage-repository';
import { hasAccountsGuard } from './has-accounts-guard';

describe('hasAccountsGuard', () => {
  let storage: { getAccounts: ReturnType<typeof vi.fn> };
  let router: { parseUrl: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    storage = { getAccounts: vi.fn() };
    router = { parseUrl: vi.fn((url: string) => new UrlTree()) };

    TestBed.configureTestingModule({
      providers: [
        { provide: StorageRepository, useValue: storage },
        { provide: Router, useValue: router },
      ],
    });
  });

  function runGuard() {
    return TestBed.runInInjectionContext(() => hasAccountsGuard({} as never, {} as never));
  }

  it('allows navigation when accounts exist', async () => {
    storage.getAccounts.mockResolvedValue([{ id: 'acc-1' }]);

    const result = await runGuard();

    expect(result).toBe(true);
    expect(router.parseUrl).not.toHaveBeenCalled();
  });

  it('redirects to /connect when there are no accounts', async () => {
    storage.getAccounts.mockResolvedValue([]);

    const result = await runGuard();

    expect(router.parseUrl).toHaveBeenCalledWith('/connect');
    expect(result).toBeInstanceOf(UrlTree);
  });
});
