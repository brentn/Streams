import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { StorageRepository } from '../storage/storage-repository';

/** Guards routes that assume at least one connected account, redirecting to /connect otherwise (bookmarking or refreshing on one of them with no accounts would otherwise show a broken/empty page). */
export const hasAccountsGuard: CanActivateFn = async () => {
  const storage = inject(StorageRepository);
  const router = inject(Router);
  const accounts = await storage.getAccounts();
  return accounts.length > 0 ? true : router.parseUrl('/connect');
};
