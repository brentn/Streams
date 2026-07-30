import { Dialog } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Account } from '../../core/models/account';
import { RecurringFlow } from '../../core/models/flow';
import { Transaction } from '../../core/models/transaction';
import { Transfer } from '../../core/models/transfer';
import { SCRUB_MAX_DAYS, SCRUB_MIN_DAYS } from '../../core/charting/date-window';
import { SimpleFinAdapter } from '../../core/simplefin/simplefin-adapter';
import { StorageRepository } from '../../core/storage/storage-repository';
import { AccountStream } from './account-stream';
import { FlowFormDialog } from './flow-form-dialog/flow-form-dialog';
import { TransferFormDialog } from './transfer-form-dialog/transfer-form-dialog';

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
    upsertFlow: ReturnType<typeof vi.fn>;
    upsertTransfer: ReturnType<typeof vi.fn>;
  };
  let simplefin: { fetchAccounts: ReturnType<typeof vi.fn> };
  let router: { navigateByUrl: ReturnType<typeof vi.fn> };
  let dialog: { open: ReturnType<typeof vi.fn> };

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
      upsertFlow: vi.fn(),
      upsertTransfer: vi.fn(),
    };
    simplefin = { fetchAccounts: vi.fn() };
    router = { navigateByUrl: vi.fn() };
    dialog = { open: vi.fn() };
    vi.stubGlobal('open', vi.fn());

    await TestBed.configureTestingModule({
      imports: [AccountStream],
      providers: [
        { provide: StorageRepository, useValue: storage },
        { provide: SimpleFinAdapter, useValue: simplefin },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: {} },
        { provide: Dialog, useValue: dialog },
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

  it('reports isAtToday and jumps back to today from any scrub position', () => {
    const fixture = TestBed.createComponent(AccountStream);
    const component = fixture.componentInstance;

    expect(component['isAtToday']()).toBe(true);

    component['dayOffset'].set(-30);
    expect(component['isAtToday']()).toBe(false);

    component['jumpToToday']();
    expect(component['dayOffset']()).toBe(0);
    expect(component['isAtToday']()).toBe(true);
  });

  it('renders the Today button only when scrubbed away from today, and hides it again after jumping back', async () => {
    const fixture = TestBed.createComponent(AccountStream);
    fixture.componentRef.setInput('id', 'acc-1');
    const component = fixture.componentInstance;
    await component['load']('acc-1');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.today')).toBeNull();

    component['dayOffset'].set(-10);
    fixture.detectChanges();
    const todayButton = fixture.nativeElement.querySelector('.today') as HTMLButtonElement | null;
    expect(todayButton).toBeTruthy();

    todayButton!.click();
    fixture.detectChanges();

    expect(component['dayOffset']()).toBe(0);
    expect(fixture.nativeElement.querySelector('.today')).toBeNull();
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
    it('shows a serious, Reauthorize-labeled banner when the account needs reauthentication', async () => {
      storage.getAccounts.mockResolvedValue([{ ...account, syncStatus: { kind: 'needs-reauth' } }]);

      const fixture = TestBed.createComponent(AccountStream);
      const component = fixture.componentInstance;
      await component['load']('acc-1');

      expect(component['banner']()).toEqual({
        message: 'Your account needs to be reauthorized in SimpleFIN.',
        severity: 'serious',
        retryLabel: 'Reauthorize',
      });
    });

    it('opens the SimpleFIN Bridge and still resyncs, staying on the same page, when the banner action fires for needs-reauth', async () => {
      storage.getAccounts.mockResolvedValue([{ ...account, syncStatus: { kind: 'needs-reauth' } }]);
      storage.getAccessUrl.mockResolvedValue('https://user:pass@bridge.simplefin.org/simplefin');
      simplefin.fetchAccounts.mockResolvedValue([{ account, transactions: [] }]);

      const fixture = TestBed.createComponent(AccountStream);
      fixture.componentRef.setInput('id', 'acc-1');
      const component = fixture.componentInstance;
      await component['load']('acc-1');

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
      storage.getAccounts.mockResolvedValue([{ ...account, syncStatus: { kind: 'needs-reauth' } }]);

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
    it('normalizes a pre-migration account with no stored dryFloor to 0', async () => {
      const { dryFloor: _dryFloor, ...legacyAccount } = account;
      storage.getAccounts.mockResolvedValue([legacyAccount as Account]);

      const fixture = TestBed.createComponent(AccountStream);
      const component = fixture.componentInstance;

      await component['load']('acc-1');

      expect(component['account']()?.dryFloor).toBe(0);
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

  describe('fresh account, no flows/transfers/transactions', () => {
    it('renders no uncategorized list and no explanatory empty-state copy, just the chart and the two buttons', async () => {
      const fixture = TestBed.createComponent(AccountStream);
      fixture.componentRef.setInput('id', 'acc-1');
      const component = fixture.componentInstance;
      await component['load']('acc-1');
      fixture.detectChanges();

      const text: string = fixture.nativeElement.textContent;
      expect(text).not.toContain('No Transactions');
      expect(text).not.toContain('No Flows');
      expect(text).not.toContain('No Transfers');
      expect(component['tributaries']()).toEqual([]);

      const buttons = Array.from(fixture.nativeElement.querySelectorAll('.entity-actions button')).map(
        (b) => (b as HTMLButtonElement).textContent?.trim(),
      );
      expect(buttons).toEqual(['Add Flow', 'Add Transfer']);
    });
  });

  describe('aggregate uncategorized tributary', () => {
    it('includes a tributary for an unmatched Transaction alongside real Flow/Transfer tributaries', async () => {
      const unmatched: Transaction = {
        id: 'txn-1',
        accountId: 'acc-1',
        date: new Date(),
        amount: -12,
        description: 'COFFEE SHOP',
        matchedFlowId: null,
      };
      storage.getTransactionsForAccount.mockResolvedValue([unmatched]);

      const fixture = TestBed.createComponent(AccountStream);
      const component = fixture.componentInstance;
      await component['load']('acc-1');

      expect(component['tributaries']()).toEqual([
        expect.objectContaining({ kind: 'uncategorized', direction: 'out', amount: 12 }),
      ]);
    });
  });

  describe('Add Flow / Add Transfer modals', () => {
    it('opens the Flow modal for the current account and persists the result', async () => {
      const newFlow: RecurringFlow = {
        id: 'flow-1',
        accountId: 'acc-1',
        name: 'Paycheck',
        direction: 'in',
        kind: 'recurring',
        amount: 2000,
        cadence: { period: 'month', interval: 1, anchors: [{ day: 1 }], anchorDate: new Date('2026-01-01') },
      };
      const closed = new Subject<RecurringFlow | undefined>();
      dialog.open.mockReturnValue({ closed });

      const fixture = TestBed.createComponent(AccountStream);
      fixture.componentRef.setInput('id', 'acc-1');
      const component = fixture.componentInstance;
      await component['load']('acc-1');

      component['openAddFlow']();

      expect(dialog.open).toHaveBeenCalledWith(FlowFormDialog, { data: { accountId: 'acc-1' } });

      closed.next(newFlow);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(storage.upsertFlow).toHaveBeenCalledWith(newFlow);
      expect(storage.getFlowsForAccount).toHaveBeenCalledWith('acc-1');
    });

    it('does not persist anything when the Flow modal is cancelled', async () => {
      const closed = new Subject<RecurringFlow | undefined>();
      dialog.open.mockReturnValue({ closed });

      const fixture = TestBed.createComponent(AccountStream);
      fixture.componentRef.setInput('id', 'acc-1');
      const component = fixture.componentInstance;
      await component['load']('acc-1');

      component['openAddFlow']();
      closed.next(undefined);
      await Promise.resolve();

      expect(storage.upsertFlow).not.toHaveBeenCalled();
    });

    it('opens the Transfer modal with all known accounts and persists the result', async () => {
      const newTransfer: Transfer = {
        id: 'transfer-1',
        fromAccountId: 'acc-1',
        toAccountId: 'acc-2',
        amount: 200,
        cadence: { period: 'once', date: new Date('2026-07-10') },
      };
      const closed = new Subject<Transfer | undefined>();
      dialog.open.mockReturnValue({ closed });

      const fixture = TestBed.createComponent(AccountStream);
      fixture.componentRef.setInput('id', 'acc-1');
      const component = fixture.componentInstance;
      await component['load']('acc-1');

      component['openAddTransfer']();

      expect(dialog.open).toHaveBeenCalledWith(TransferFormDialog, {
        data: { accountId: 'acc-1', accounts: [account] },
      });

      closed.next(newTransfer);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(storage.upsertTransfer).toHaveBeenCalledWith(newTransfer);
      expect(storage.getTransfersForAccount).toHaveBeenCalledWith('acc-1');
    });
  });
});
