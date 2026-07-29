import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Account } from '../../core/models/account';
import { Transfer } from '../../core/models/transfer';
import { HALF_WINDOW_DAYS, SCRUB_MAX_DAYS, SCRUB_MIN_DAYS } from '../../core/charting/date-window';
import { SimpleFinAdapter } from '../../core/simplefin/simplefin-adapter';
import { StorageRepository } from '../../core/storage/storage-repository';
import { MultiAccountStream } from './multi-account-stream';

const checking: Account = {
  id: 'acc-checking',
  name: 'Checking',
  institutionName: 'Bank',
  balance: 1000,
  balanceDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
  expectedSign: 1,
  dryFloor: 0,
};

const creditCard: Account = {
  id: 'acc-credit',
  name: 'Credit Card',
  institutionName: 'Bank',
  balance: -300,
  balanceDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
  expectedSign: -1,
  dryFloor: 0,
};

describe('MultiAccountStream', () => {
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
      getAccounts: vi.fn().mockResolvedValue([checking, creditCard]),
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
    vi.stubGlobal('open', vi.fn());

    await TestBed.configureTestingModule({
      imports: [MultiAccountStream],
      providers: [
        { provide: StorageRepository, useValue: storage },
        { provide: SimpleFinAdapter, useValue: simplefin },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: {} },
      ],
    }).compileComponents();
  });

  it('loads every account with its own lane and sums them into the Total', async () => {
    const fixture = TestBed.createComponent(MultiAccountStream);
    const component = fixture.componentInstance;

    await component['load']();

    const lanes = component['lanes']();
    expect(lanes.map((l) => l.account.id)).toEqual(['acc-checking', 'acc-credit']);
    expect(lanes[0].balance).toBe(1000);
    expect(lanes[1].balance).toBe(-300);
    expect(component['totalBalance']()).toBe(700);
  });

  it('flags a lane as opposite-sign only when its balance crosses to the wrong side of expectedSign', async () => {
    // checking (expectedSign 1) is normally positive; credit card (expectedSign -1) is normally
    // negative (money owed) — both fixtures are in their normal state, so neither is opposite.
    const fixture = TestBed.createComponent(MultiAccountStream);
    const component = fixture.componentInstance;

    await component['load']();

    const lanes = component['lanes']();
    expect(lanes[0].isOpposite).toBe(false);
    expect(lanes[1].isOpposite).toBe(false);

    // An overdrawn checking account crosses to the opposite side.
    storage.getAccounts.mockResolvedValue([{ ...checking, balance: -50 }]);
    await component['load']();
    expect(component['lanes']()[0].isOpposite).toBe(true);
  });

  it('flags the Total as opposite-sign only when net worth goes negative', async () => {
    storage.getAccounts.mockResolvedValue([
      { ...checking, balance: 100 },
      { ...creditCard, balance: -300 },
    ]);
    const fixture = TestBed.createComponent(MultiAccountStream);
    const component = fixture.componentInstance;

    await component['load']();

    expect(component['totalBalance']()).toBe(-200);
    expect(component['totalIsOpposite']()).toBe(true);
  });

  it('applies a Transfer symmetrically: the from-lane loses exactly what the to-lane gains, leaving the Total unchanged', async () => {
    // Anchors on every day of the week so at least one occurrence is guaranteed to fire
    // somewhere in the projected range, regardless of exactly when "today" falls.
    const allDays = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek: dayOfWeek as 0 }));
    const transfer: Transfer = {
      id: 'transfer-1',
      fromAccountId: 'acc-checking',
      toAccountId: 'acc-credit',
      amount: 10,
      cadence: { period: 'week', interval: 1, anchors: allDays, anchorDate: new Date() },
    };

    const baselineFixture = TestBed.createComponent(MultiAccountStream);
    const baseline = baselineFixture.componentInstance;
    await baseline['load']();
    baseline['dayOffset'].set(5);
    const baselineLanes = baseline['lanes']();

    storage.getTransfersForAccount.mockImplementation((accountId: string) =>
      Promise.resolve(accountId === 'acc-checking' || accountId === 'acc-credit' ? [transfer] : []),
    );
    const fixture = TestBed.createComponent(MultiAccountStream);
    const component = fixture.componentInstance;
    await component['load']();
    component['dayOffset'].set(5);
    const lanes = component['lanes']();

    const checkingDelta = lanes[0].balance - baselineLanes[0].balance;
    const creditDelta = lanes[1].balance - baselineLanes[1].balance;
    expect(checkingDelta).toBeLessThan(0);
    expect(creditDelta).toBe(-checkingDelta);
    // Net worth is unaffected by a Transfer between two of the group's own Accounts.
    expect(component['totalBalance']()).toBe(baseline['totalBalance']());
  });

  it('clamps day offset shifts within the scrub bounds', () => {
    const fixture = TestBed.createComponent(MultiAccountStream);
    const component = fixture.componentInstance;

    component['dayOffset'].set(SCRUB_MAX_DAYS);
    component['shiftDay'](1);
    expect(component['dayOffset']()).toBe(SCRUB_MAX_DAYS);

    component['dayOffset'].set(SCRUB_MIN_DAYS);
    component['shiftDay'](-1);
    expect(component['dayOffset']()).toBe(SCRUB_MIN_DAYS);
  });

  it("shifts each lane's actual/projected boundary within the window as the scrub position moves, rather than staying fixed at the window center", async () => {
    const fixture = TestBed.createComponent(MultiAccountStream);
    const component = fixture.componentInstance;
    await component['load']();

    expect(component['lanes']()[0].boundaryX).toBe(HALF_WINDOW_DAYS + 1); // balanceDate is "tomorrow"

    component['dayOffset'].set(-5);
    expect(component['lanes']()[0].boundaryX).toBe(HALF_WINDOW_DAYS + 6);
  });

  it("sets the Total boundary at the earliest account balanceDate, so it's only actual where every account is", async () => {
    const earlier = new Date(Date.now());
    storage.getAccounts.mockResolvedValue([
      { ...checking, balanceDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) },
      { ...creditCard, balanceDate: earlier },
    ]);
    const fixture = TestBed.createComponent(MultiAccountStream);
    const component = fixture.componentInstance;

    await component['load']();

    expect(component['totalBoundaryX']()).toBe(component['lanes']()[1].boundaryX);
  });

  it('re-syncs only accounts already known locally, preserving their expectedSign', async () => {
    storage.getAccessUrl.mockResolvedValue('https://user:pass@bridge.simplefin.org/simplefin');
    simplefin.fetchAccounts.mockResolvedValue([
      {
        account: { ...checking, expectedSign: undefined as never, balance: 1200 },
        transactions: [],
      },
      {
        account: {
          id: 'acc-new',
          name: 'New',
          institutionName: 'Bank',
          balance: 5,
          balanceDate: new Date(),
        },
        transactions: [],
      },
    ]);

    const fixture = TestBed.createComponent(MultiAccountStream);
    const component = fixture.componentInstance;

    await component['resync']();

    expect(storage.upsertAccount).toHaveBeenCalledTimes(1);
    expect(storage.upsertAccount).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'acc-checking', expectedSign: 1, balance: 1200 }),
    );
    expect(component['operationError']()).toBeNull();
  });

  it('surfaces an error when re-syncing without a stored access URL', async () => {
    storage.getAccessUrl.mockResolvedValue(undefined);

    const fixture = TestBed.createComponent(MultiAccountStream);
    const component = fixture.componentInstance;

    await component['resync']();

    expect(component['operationError']()).toBe('No SimpleFIN connection found.');
  });

  describe('connection-level sync status', () => {
    it('fans needs-reauth from any one account to a serious, Reauthorize-labeled banner', async () => {
      storage.getAccounts.mockResolvedValue([
        checking,
        { ...creditCard, syncStatus: { kind: 'needs-reauth' } },
      ]);

      const fixture = TestBed.createComponent(MultiAccountStream);
      const component = fixture.componentInstance;
      await component['load']();

      expect(component['banner']()).toEqual({
        message: 'Your account needs to be reauthorized in SimpleFIN.',
        severity: 'serious',
        retryLabel: 'Reauthorize',
      });
    });

    it('opens the SimpleFIN Bridge and still resyncs, staying on the same page, when the banner action fires for needs-reauth', async () => {
      storage.getAccounts.mockResolvedValue([
        { ...checking, syncStatus: { kind: 'needs-reauth' } },
      ]);
      storage.getAccessUrl.mockResolvedValue('https://user:pass@bridge.simplefin.org/simplefin');
      simplefin.fetchAccounts.mockResolvedValue([{ account: checking, transactions: [] }]);

      const fixture = TestBed.createComponent(MultiAccountStream);
      const component = fixture.componentInstance;
      await component['load']();

      component['onBannerAction']();
      await new Promise((resolve) => setTimeout(resolve)); // let the fire-and-forget resync settle

      expect(window.open).toHaveBeenCalledWith(
        'https://beta-bridge.simplefin.org/my-account',
        '_blank',
        'noopener,noreferrer',
      );
      expect(router.navigateByUrl).not.toHaveBeenCalled();
      expect(simplefin.fetchAccounts).toHaveBeenCalled();
    });

    it('shows a per-lane sync-issue badge without a connection-level banner', async () => {
      storage.getAccounts.mockResolvedValue([
        { ...checking, syncStatus: { kind: 'sync-issue', message: 'Try again later.' } },
        creditCard,
      ]);

      const fixture = TestBed.createComponent(MultiAccountStream);
      const component = fixture.componentInstance;
      await component['load']();

      const lanes = component['lanes']();
      expect(lanes[0].syncIssueMessage).toBe('Try again later.');
      expect(lanes[1].syncIssueMessage).toBeNull();
      expect(component['banner']().message).toBeNull();
    });

    it('suppresses the per-lane sync-issue badge while the connection-level banner is showing something higher-priority', async () => {
      storage.getAccounts.mockResolvedValue([
        { ...checking, syncStatus: { kind: 'sync-issue', message: 'Try again later.' } },
        { ...creditCard, syncStatus: { kind: 'needs-reauth' } },
      ]);

      const fixture = TestBed.createComponent(MultiAccountStream);
      const component = fixture.componentInstance;
      await component['load']();

      expect(component['banner']().severity).toBe('serious');
      expect(component['lanes']()[0].syncIssueMessage).toBeNull();
    });
  });
});
