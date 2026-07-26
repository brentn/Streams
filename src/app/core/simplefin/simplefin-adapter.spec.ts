import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SimpleFinAdapter } from './simplefin-adapter';

const ACCOUNTS_FIXTURE = {
  errors: [],
  accounts: [
    {
      id: 'ACT-checking-1',
      name: 'Everyday Checking',
      org: { name: 'First Bank' },
      balance: '1234.56',
      'balance-date': 1753449600, // 2025-07-25T12:00:00Z
      transactions: [
        {
          id: 'TXN-1',
          posted: 1753363200, // 2025-07-24T12:00:00Z
          amount: '-42.10',
          description: 'COFFEE SHOP',
        },
        {
          id: 'TXN-2',
          posted: 1753276800, // 2025-07-23T12:00:00Z
          amount: '2000.00',
          description: 'PAYROLL',
        },
      ],
    },
  ],
};

describe('SimpleFinAdapter', () => {
  let adapter: SimpleFinAdapter;

  beforeEach(() => {
    adapter = new SimpleFinAdapter();
    vi.stubGlobal('fetch', vi.fn());
  });

  describe('claimAccessUrl', () => {
    it('decodes the setup token and POSTs to the claim URL', async () => {
      const claimUrl = 'https://bridge.simplefin.org/simplefin/claim/DEMO';
      const setupToken = btoa(claimUrl);
      const accessUrl = 'https://user123:pass456@bridge.simplefin.org/simplefin';
      vi.mocked(fetch).mockResolvedValue(
        new Response(accessUrl, { status: 200 }),
      );

      const result = await adapter.claimAccessUrl(setupToken);

      expect(fetch).toHaveBeenCalledWith(claimUrl, { method: 'POST' });
      expect(result).toBe(accessUrl);
    });

    it('throws when the claim request fails', async () => {
      vi.mocked(fetch).mockResolvedValue(new Response('nope', { status: 403 }));

      await expect(adapter.claimAccessUrl(btoa('https://example.com/claim'))).rejects.toThrow(
        /403/,
      );
    });
  });

  describe('fetchAccounts', () => {
    it('sends Basic Auth parsed from the Access URL and maps the response', async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify(ACCOUNTS_FIXTURE), { status: 200 }),
      );

      const result = await adapter.fetchAccounts(
        'https://user123:pass456@bridge.simplefin.org/simplefin',
      );

      expect(fetch).toHaveBeenCalledWith('https://bridge.simplefin.org/simplefin/accounts', {
        headers: { Authorization: `Basic ${btoa('user123:pass456')}` },
      });

      expect(result).toEqual([
        {
          account: {
            id: 'ACT-checking-1',
            name: 'Everyday Checking',
            institutionName: 'First Bank',
            balance: 1234.56,
            balanceDate: new Date(1753449600 * 1000),
          },
          transactions: [
            {
              id: 'TXN-1',
              accountId: 'ACT-checking-1',
              date: new Date(1753363200 * 1000),
              amount: -42.1,
              description: 'COFFEE SHOP',
            },
            {
              id: 'TXN-2',
              accountId: 'ACT-checking-1',
              date: new Date(1753276800 * 1000),
              amount: 2000,
              description: 'PAYROLL',
            },
          ],
        },
      ]);
    });

    it('throws when the accounts request fails', async () => {
      vi.mocked(fetch).mockResolvedValue(new Response('server error', { status: 500 }));

      await expect(
        adapter.fetchAccounts('https://user:pass@bridge.simplefin.org/simplefin'),
      ).rejects.toThrow(/500/);
    });
  });
});
