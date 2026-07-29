import { beforeEach, describe, expect, it, vi } from 'vitest';
import { classifySyncStatus, SimpleFinAdapter, SimpleFinAuthError } from './simplefin-adapter';

const ACCOUNTS_FIXTURE = {
  errlist: [],
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
    const startDate = new Date('2026-05-01T00:00:00Z');
    const startDateSeconds = Math.floor(startDate.getTime() / 1000);

    it('sends Basic Auth parsed from the Access URL and maps the response', async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify(ACCOUNTS_FIXTURE), { status: 200 }),
      );

      const result = await adapter.fetchAccounts(
        'https://user123:pass456@bridge.simplefin.org/simplefin',
        startDate,
      );

      expect(fetch).toHaveBeenCalledWith(
        `https://bridge.simplefin.org/simplefin/accounts?start-date=${startDateSeconds}`,
        { headers: { Authorization: `Basic ${btoa('user123:pass456')}` } },
      );

      expect(result).toEqual([
        {
          account: {
            id: 'ACT-checking-1',
            name: 'Everyday Checking',
            institutionName: 'First Bank',
            balance: 1234.56,
            balanceDate: new Date(1753449600 * 1000),
            syncStatus: { kind: 'ok' },
          },
          transactions: [
            {
              id: 'TXN-1',
              accountId: 'ACT-checking-1',
              date: new Date(1753363200 * 1000),
              amount: -42.1,
              description: 'COFFEE SHOP',
              matchedFlowId: null,
            },
            {
              id: 'TXN-2',
              accountId: 'ACT-checking-1',
              date: new Date(1753276800 * 1000),
              amount: 2000,
              description: 'PAYROLL',
              matchedFlowId: null,
            },
          ],
        },
      ]);
    });

    it('throws when the accounts request fails', async () => {
      vi.mocked(fetch).mockResolvedValue(new Response('server error', { status: 500 }));

      await expect(
        adapter.fetchAccounts('https://user:pass@bridge.simplefin.org/simplefin', startDate),
      ).rejects.toThrow(/500/);
    });

    it('throws SimpleFinAuthError, not a generic Error, on HTTP 403', async () => {
      vi.mocked(fetch).mockResolvedValue(new Response('forbidden', { status: 403 }));

      await expect(
        adapter.fetchAccounts('https://user:pass@bridge.simplefin.org/simplefin', startDate),
      ).rejects.toThrow(SimpleFinAuthError);
    });

    it('includes end-date when given one, for a bounded backfill chunk request', async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(JSON.stringify(ACCOUNTS_FIXTURE), { status: 200 }),
      );
      const endDate = new Date('2026-06-01T00:00:00Z');

      await adapter.fetchAccounts(
        'https://user:pass@bridge.simplefin.org/simplefin',
        startDate,
        endDate,
      );

      expect(fetch).toHaveBeenCalledWith(
        `https://bridge.simplefin.org/simplefin/accounts?start-date=${startDateSeconds}&end-date=${Math.floor(endDate.getTime() / 1000)}`,
        expect.anything(),
      );
    });

    it('classifies a synced account from a scoped errlist entry as needs-reauth', async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(
          JSON.stringify({
            ...ACCOUNTS_FIXTURE,
            errlist: [{ code: 'con.auth', msg: 'Authentication failed', account_id: 'ACT-checking-1' }],
          }),
          { status: 200 },
        ),
      );

      const [{ account }] = await adapter.fetchAccounts(
        'https://user:pass@bridge.simplefin.org/simplefin',
        startDate,
      );

      expect(account.syncStatus).toEqual({ kind: 'needs-reauth' });
    });

    it('classifies a synced account from a scoped non-auth errlist entry as sync-issue', async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(
          JSON.stringify({
            ...ACCOUNTS_FIXTURE,
            errlist: [
              { code: 'act.failed', msg: 'Try again later.', account_id: 'ACT-checking-1' },
            ],
          }),
          { status: 200 },
        ),
      );

      const [{ account }] = await adapter.fetchAccounts(
        'https://user:pass@bridge.simplefin.org/simplefin',
        startDate,
      );

      expect(account.syncStatus).toEqual({ kind: 'sync-issue', message: 'Try again later.' });
    });

    it('surfaces a sync-issue from the deprecated errors[] field when a bridge sends no errlist', async () => {
      const { errlist: _errlist, ...fixtureWithoutErrlist } = ACCOUNTS_FIXTURE;
      vi.mocked(fetch).mockResolvedValue(
        new Response(
          JSON.stringify({
            ...fixtureWithoutErrlist,
            errors: [
              'Requested date range exceeds limit of 90 days and was capped.',
              'Connection to CIBC may need attention. Auth required',
            ],
          }),
          { status: 200 },
        ),
      );

      const [{ account }] = await adapter.fetchAccounts(
        'https://user:pass@bridge.simplefin.org/simplefin',
        startDate,
      );

      expect(account.syncStatus).toEqual({
        kind: 'sync-issue',
        message:
          'Requested date range exceeds limit of 90 days and was capped.; Connection to CIBC may need attention. Auth required',
      });
    });

    it('fans a connection-level errlist entry (no account_id) onto every returned account', async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(
          JSON.stringify({
            ...ACCOUNTS_FIXTURE,
            errlist: [{ code: 'gen.auth', msg: 'Authentication failed', conn_id: 'CON-1' }],
          }),
          { status: 200 },
        ),
      );

      const [{ account }] = await adapter.fetchAccounts(
        'https://user:pass@bridge.simplefin.org/simplefin',
        startDate,
      );

      expect(account.syncStatus).toEqual({ kind: 'needs-reauth' });
    });
  });

  describe('classifySyncStatus', () => {
    it('returns ok when no errlist entry applies to the account', () => {
      expect(classifySyncStatus('acc-1', [])).toEqual({ kind: 'ok' });
      expect(
        classifySyncStatus('acc-1', [{ code: 'act.failed', msg: 'x', account_id: 'acc-other' }]),
      ).toEqual({ kind: 'ok' });
    });

    it('never keys off msg text, only code', () => {
      expect(
        classifySyncStatus('acc-1', [
          { code: 'act.failed', msg: 'You must reauthenticate.', account_id: 'acc-1' },
        ]),
      ).toEqual({ kind: 'sync-issue', message: 'You must reauthenticate.' });
    });

    it('joins every applicable non-auth message, so no error is silently dropped', () => {
      expect(
        classifySyncStatus('acc-1', [
          { code: 'act.failed', msg: 'Try again later.', account_id: 'acc-1' },
          { code: '', msg: 'Requested date range exceeds limit of 90 days and was capped.' },
        ]),
      ).toEqual({
        kind: 'sync-issue',
        message: 'Try again later.; Requested date range exceeds limit of 90 days and was capped.',
      });
    });

    it('treats con.auth and gen.auth as needs-reauth, everything else as sync-issue', () => {
      expect(
        classifySyncStatus('acc-1', [{ code: 'con.auth', msg: 'x', account_id: 'acc-1' }]),
      ).toEqual({ kind: 'needs-reauth' });
      expect(
        classifySyncStatus('acc-1', [{ code: 'gen.auth', msg: 'x', account_id: 'acc-1' }]),
      ).toEqual({ kind: 'needs-reauth' });
      expect(
        classifySyncStatus('acc-1', [{ code: 'gen.api', msg: 'x', account_id: 'acc-1' }]),
      ).toEqual({ kind: 'sync-issue', message: 'x' });
      expect(
        classifySyncStatus('acc-1', [{ code: 'act.missingdata', msg: 'x', account_id: 'acc-1' }]),
      ).toEqual({ kind: 'sync-issue', message: 'x' });
    });
  });
});
