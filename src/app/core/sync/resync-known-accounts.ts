import { SimpleFinAdapter } from '../simplefin/simplefin-adapter';
import { StorageRepository } from '../storage/storage-repository';

/**
 * Re-syncs every already-confirmed account from SimpleFIN, preserving each
 * account's previously chosen `expectedSign`. Shared by `account-stream` and
 * the multi-account view — resync only refreshes accounts the user has
 * already been through the connect flow's sign-confirmation step for; an
 * account SimpleFIN returns that isn't stored locally is skipped, since
 * there's no flow here to confirm its sign.
 */
export async function resyncKnownAccounts(
  storage: StorageRepository,
  simplefin: SimpleFinAdapter,
): Promise<void> {
  const accessUrl = await storage.getAccessUrl();
  if (!accessUrl) {
    throw new Error('No SimpleFIN connection found.');
  }

  const synced = await simplefin.fetchAccounts(accessUrl);
  const existing = await storage.getAccounts();

  for (const { account, transactions } of synced) {
    const previous = existing.find((a) => a.id === account.id);
    if (!previous) continue;
    await storage.upsertAccount({ ...account, expectedSign: previous.expectedSign });
    await storage.upsertTransactions(transactions);
  }
}
