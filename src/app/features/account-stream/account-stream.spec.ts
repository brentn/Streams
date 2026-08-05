import { Dialog } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Account } from '../../core/models/account';
import { BudgetFlow, DayOfWeek, RecurringFlow } from '../../core/models/flow';
import { Transaction } from '../../core/models/transaction';
import { Transfer } from '../../core/models/transfer';
import { SCRUB_MAX_DAYS, SCRUB_MIN_DAYS } from '../../core/charting/date-window';
import { SimpleFinAdapter } from '../../core/simplefin/simplefin-adapter';
import { StorageRepository } from '../../core/storage/storage-repository';
import { AccountStream } from './account-stream';
import { FlowFormDialog, FlowFormDialogResult } from './flow-form-dialog/flow-form-dialog';
import { TransferFormDialog, TransferFormDialogResult } from './transfer-form-dialog/transfer-form-dialog';

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
    getSkippedOccurrences: ReturnType<typeof vi.fn>;
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
    deleteCategorizationRule: ReturnType<typeof vi.fn>;
    deleteFlow: ReturnType<typeof vi.fn>;
    deleteTransfer: ReturnType<typeof vi.fn>;
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
      getSkippedOccurrences: vi.fn().mockResolvedValue([]),
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
      deleteCategorizationRule: vi.fn().mockResolvedValue(undefined),
      deleteFlow: vi.fn().mockResolvedValue(undefined),
      deleteTransfer: vi.fn().mockResolvedValue(undefined),
    };
    simplefin = { fetchAccounts: vi.fn() };
    router = { navigateByUrl: vi.fn() };
    dialog = { open: vi.fn() };
    vi.stubGlobal('open', vi.fn());
    Element.prototype.scrollIntoView = vi.fn();

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

    it('folds an Outstanding Flow’s missing amount into the Running-Dry projection (ADR-0012)', async () => {
      const now = Date.now();
      // balanceDate synced an hour ago, well after the Flow's one-time occurrence two hours
      // ago — so it's Outstanding — and well before "now", so effectiveFlows' own synthetic
      // occurrence always lands safely inside (balanceDate, now].
      const syncedAccount: Account = {
        ...account,
        balance: 1000,
        balanceDate: new Date(now - 60 * 60 * 1000),
        dryFloor: 850,
      };
      storage.getAccounts.mockResolvedValue([syncedAccount]);
      const lateFlow: RecurringFlow = {
        id: 'flow-late',
        accountId: 'acc-1',
        name: 'Rent',
        direction: 'out',
        kind: 'recurring',
        amount: 200,
        cadence: { period: 'once', date: new Date(now - 2 * 60 * 60 * 1000) },
      };
      storage.getFlowsForAccount.mockResolvedValue([lateFlow]);

      const fixture = TestBed.createComponent(AccountStream);
      const component = fixture.componentInstance;

      await component['load']('acc-1');

      // Without the fix, the missed occurrence would simply vanish from the projection and
      // the balance would still read 1000, never crossing the 850 Dry Floor.
      expect(component['dryAlert']()).toEqual(expect.objectContaining({ balance: 800 }));
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
      expect(fixture.nativeElement.querySelector('.budgets')).toBeNull();

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
        matchedTarget: null,
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

  describe('Outstanding Flow tributary rendering (#88)', () => {
    // A weekly Flow anchored to the weekday three days ago, so its most recent occurrence
    // landed in the past (distinct from today's synthetic stand-in position) regardless of
    // which day of the week the suite happens to run on.
    const now = new Date();
    const missedOccurrence = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 3);
    const weeklyFlow: RecurringFlow = {
      id: 'flow-weekly',
      accountId: 'acc-1',
      name: 'Subscription',
      direction: 'out',
      kind: 'recurring',
      amount: 15,
      cadence: {
        period: 'week',
        interval: 1,
        anchors: [{ dayOfWeek: missedOccurrence.getDay() as DayOfWeek }],
        anchorDate: new Date(2020, 0, 1),
      },
    };

    it("excludes the missed occurrence's own Tributary and adds a same-day 'Pending' stand-in instead", async () => {
      storage.getFlowsForAccount.mockResolvedValue([weeklyFlow]);

      const fixture = TestBed.createComponent(AccountStream);
      const component = fixture.componentInstance;
      await component['load']('acc-1');

      const tributaries = component['tributaries']().filter((t) => t.flowId === 'flow-weekly');

      const original = tributaries.find((t) => t.date.getTime() === missedOccurrence.getTime());
      expect(original).toBeUndefined();

      const standIn = tributaries.find((t) => t.label === 'Pending: Subscription');
      expect(standIn).toEqual(
        expect.objectContaining({ kind: 'flow', flowId: 'flow-weekly', direction: 'out', amount: 15 }),
      );
      expect(standIn?.warning).toBe(true);
    });

    it('opens the same TributaryPanel a real occurrence would when the Pending stand-in is clicked', async () => {
      storage.getFlowsForAccount.mockResolvedValue([weeklyFlow]);

      const fixture = TestBed.createComponent(AccountStream);
      const component = fixture.componentInstance;
      await component['load']('acc-1');

      const standIn = component['tributaries']().find((t) => t.label === 'Pending: Subscription')!;
      component['onTributaryClick'](standIn);

      expect(dialog.open).not.toHaveBeenCalled();
      expect(component['openTributary']()).toEqual(standIn);
    });

    it('stops excluding the past marker and stops rendering the Pending stand-in once a match posts', async () => {
      storage.getFlowsForAccount.mockResolvedValue([weeklyFlow]);
      const matched: Transaction = {
        id: 'txn-1',
        accountId: 'acc-1',
        date: missedOccurrence,
        amount: -15,
        description: 'SUBSCRIPTION CO',
        matchedTarget: { kind: 'flow', id: 'flow-weekly' },
      };
      storage.getTransactionsForAccount.mockResolvedValue([matched]);

      const fixture = TestBed.createComponent(AccountStream);
      const component = fixture.componentInstance;
      await component['load']('acc-1');

      const tributaries = component['tributaries']().filter((t) => t.flowId === 'flow-weekly');

      expect(tributaries.some((t) => t.label === 'Pending: Subscription')).toBe(false);
      expect(tributaries.some((t) => t.warning)).toBe(false);
    });
  });

  describe('Budgets list', () => {
    const groceriesBudget: BudgetFlow = {
      id: 'budget-groceries',
      accountId: 'acc-1',
      name: 'Groceries',
      direction: 'out',
      kind: 'budget',
      limit: 400,
      period: 'month',
    };

    it('renders no tributary for a budget-kind Flow, but does render it as a row in the Budgets list beneath the uncategorized list', async () => {
      storage.getFlowsForAccount.mockResolvedValue([groceriesBudget]);

      const fixture = TestBed.createComponent(AccountStream);
      fixture.componentRef.setInput('id', 'acc-1');
      const component = fixture.componentInstance;
      await component['load']('acc-1');
      fixture.detectChanges();

      expect(component['tributaries']()).toEqual([]);
      const rows = fixture.nativeElement.querySelectorAll('.budget-row');
      expect(rows.length).toBe(1);
      expect(rows[0].textContent).toContain('Groceries');
    });

    it('clicking a budget row opens the same drill-in panel a recurring Flow tributary click does', async () => {
      storage.getFlowsForAccount.mockResolvedValue([groceriesBudget]);

      const fixture = TestBed.createComponent(AccountStream);
      fixture.componentRef.setInput('id', 'acc-1');
      const component = fixture.componentInstance;
      await component['load']('acc-1');
      fixture.detectChanges();

      const row = fixture.nativeElement.querySelector('.budget-row') as HTMLElement;
      row.click();
      fixture.detectChanges();

      expect(dialog.open).not.toHaveBeenCalled();
      expect(component['openTributary']()).toEqual(
        expect.objectContaining({ kind: 'flow', flowId: 'budget-groceries', label: 'Groceries' }),
      );
      expect(fixture.nativeElement.querySelector('app-tributary-panel')).toBeTruthy();
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

  describe('tributary drill-in', () => {
    const recurringFlow: RecurringFlow = {
      id: 'flow-rent',
      accountId: 'acc-1',
      name: 'Rent',
      direction: 'out',
      kind: 'recurring',
      amount: 1500,
      cadence: { period: 'month', interval: 1, anchors: [{ day: 1 }], anchorDate: new Date('2026-01-01') },
    };

    const oneTimeFlow: RecurringFlow = {
      ...recurringFlow,
      id: 'flow-onetime',
      name: 'Bonus',
      cadence: { period: 'once', date: new Date('2026-07-10') },
    };

    const oneTimeTransfer: Transfer = {
      id: 'transfer-onetime',
      fromAccountId: 'acc-1',
      toAccountId: 'acc-2',
      amount: 300,
      cadence: { period: 'once', date: new Date('2026-07-10') },
    };

    it('opens FlowFormDialog directly, pre-filled, for a one-time Flow tributary — no panel', async () => {
      storage.getFlowsForAccount.mockResolvedValue([oneTimeFlow]);
      dialog.open.mockReturnValue({ closed: new Subject() });

      const fixture = TestBed.createComponent(AccountStream);
      fixture.componentRef.setInput('id', 'acc-1');
      const component = fixture.componentInstance;
      await component['load']('acc-1');

      component['onTributaryClick']({
        id: 't1',
        kind: 'flow',
        direction: 'out',
        date: new Date('2026-07-10'),
        x: 0,
        amount: 300,
        label: 'Bonus',
        flowId: 'flow-onetime',
      });

      expect(dialog.open).toHaveBeenCalledWith(FlowFormDialog, {
        data: { accountId: 'acc-1', flow: oneTimeFlow },
      });
      expect(component['openTributary']()).toBeNull();
    });

    it("cascade-deletes the Flow and reloads, when the one-time Flow's edit dialog closes with 'deleted'", async () => {
      storage.getFlowsForAccount.mockResolvedValue([oneTimeFlow]);
      const matching: Transaction = {
        id: 'txn-1',
        accountId: 'acc-1',
        date: new Date('2026-07-10'),
        amount: -300,
        description: 'BONUS',
        matchedTarget: { kind: 'flow', id: 'flow-onetime' },
      };
      storage.getTransactionsForAccount.mockResolvedValue([matching]);
      storage.getCategorizationRules.mockResolvedValue([
        { matchText: 'bonus', target: { kind: 'flow', id: 'flow-onetime' } },
      ]);
      const closed = new Subject<FlowFormDialogResult | undefined>();
      dialog.open.mockReturnValue({ closed });

      const fixture = TestBed.createComponent(AccountStream);
      fixture.componentRef.setInput('id', 'acc-1');
      const component = fixture.componentInstance;
      await component['load']('acc-1');

      component['onTributaryClick']({
        id: 't1',
        kind: 'flow',
        direction: 'out',
        date: new Date('2026-07-10'),
        x: 0,
        amount: 300,
        label: 'Bonus',
        flowId: 'flow-onetime',
      });
      const unassigned = { ...matching, matchedTarget: null };
      storage.getFlowsForAccount.mockResolvedValue([]);
      storage.getTransactionsForAccount.mockResolvedValue([unassigned]);
      closed.next('deleted');
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(storage.deleteCategorizationRule).toHaveBeenCalledWith('bonus');
      expect(storage.upsertTransactions).toHaveBeenCalledWith([unassigned]);
      expect(storage.deleteFlow).toHaveBeenCalledWith('flow-onetime');
      expect(storage.upsertFlow).not.toHaveBeenCalled();
      expect(component['flows']()).toEqual([]);
      expect(component['transactions']()).toEqual([unassigned]);
    });

    it('opens TransferFormDialog directly, pre-filled, for a one-time Transfer tributary — no panel', async () => {
      storage.getTransfersForAccount.mockResolvedValue([oneTimeTransfer]);
      dialog.open.mockReturnValue({ closed: new Subject() });

      const fixture = TestBed.createComponent(AccountStream);
      fixture.componentRef.setInput('id', 'acc-1');
      const component = fixture.componentInstance;
      await component['load']('acc-1');

      component['onTributaryClick']({
        id: 't2',
        kind: 'transfer',
        direction: 'out',
        date: new Date('2026-07-10'),
        x: 0,
        amount: 300,
        label: '→ Savings',
        transferId: 'transfer-onetime',
      });

      expect(dialog.open).toHaveBeenCalledWith(TransferFormDialog, {
        data: { accountId: 'acc-1', accounts: [account], transfer: oneTimeTransfer },
      });
      expect(component['openTributary']()).toBeNull();
    });

    it("cascade-deletes the Transfer and reloads, when the one-time Transfer's edit dialog closes with 'deleted'", async () => {
      storage.getTransfersForAccount.mockResolvedValue([oneTimeTransfer]);
      const matching: Transaction = {
        id: 'txn-1',
        accountId: 'acc-1',
        date: new Date('2026-07-10'),
        amount: -300,
        description: 'TRANSFER TO SAVINGS',
        matchedTarget: { kind: 'transfer', id: 'transfer-onetime' },
      };
      const unassigned = { ...matching, matchedTarget: null };
      let isDeleted = false;
      storage.getTransactionsForAccount.mockImplementation((accountId: string) =>
        Promise.resolve(accountId === 'acc-1' ? [isDeleted ? unassigned : matching] : []),
      );
      storage.getCategorizationRules.mockResolvedValue([
        { matchText: 'transfer to savings', target: { kind: 'transfer', id: 'transfer-onetime' } },
      ]);
      storage.deleteTransfer.mockImplementation(() => {
        isDeleted = true;
        return Promise.resolve();
      });
      const closed = new Subject<TransferFormDialogResult | undefined>();
      dialog.open.mockReturnValue({ closed });

      const fixture = TestBed.createComponent(AccountStream);
      fixture.componentRef.setInput('id', 'acc-1');
      const component = fixture.componentInstance;
      await component['load']('acc-1');

      component['onTributaryClick']({
        id: 't2',
        kind: 'transfer',
        direction: 'out',
        date: new Date('2026-07-10'),
        x: 0,
        amount: 300,
        label: '→ Savings',
        transferId: 'transfer-onetime',
      });
      storage.getTransfersForAccount.mockResolvedValue([]);
      closed.next('deleted');
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(storage.deleteCategorizationRule).toHaveBeenCalledWith('transfer to savings');
      expect(storage.upsertTransactions).toHaveBeenCalledWith([unassigned]);
      expect(storage.deleteTransfer).toHaveBeenCalledWith('transfer-onetime');
      expect(storage.upsertTransfer).not.toHaveBeenCalled();
      expect(component['transfers']()).toEqual([]);
      expect(component['transactions']()).toEqual([unassigned]);
    });

    it('opens the drill-in panel, not a dialog, for a recurring Flow tributary', async () => {
      storage.getFlowsForAccount.mockResolvedValue([recurringFlow]);

      const fixture = TestBed.createComponent(AccountStream);
      fixture.componentRef.setInput('id', 'acc-1');
      const component = fixture.componentInstance;
      await component['load']('acc-1');

      const tributary = {
        id: 't3',
        kind: 'flow' as const,
        direction: 'out' as const,
        date: new Date('2026-07-01'),
        x: 0,
        amount: 1500,
        label: 'Rent',
        flowId: 'flow-rent',
      };
      component['onTributaryClick'](tributary);

      expect(dialog.open).not.toHaveBeenCalled();
      expect(component['openTributary']()).toEqual(tributary);
    });

    it('clears openTributary when the panel closes', async () => {
      storage.getFlowsForAccount.mockResolvedValue([recurringFlow]);

      const fixture = TestBed.createComponent(AccountStream);
      fixture.componentRef.setInput('id', 'acc-1');
      const component = fixture.componentInstance;
      await component['load']('acc-1');

      component['onTributaryClick']({
        id: 't3',
        kind: 'flow',
        direction: 'out',
        date: new Date('2026-07-01'),
        x: 0,
        amount: 1500,
        label: 'Rent',
        flowId: 'flow-rent',
      });
      expect(component['openTributary']()).not.toBeNull();

      component['closeTributaryPanel']();

      expect(component['openTributary']()).toBeNull();
    });

    it('scrolls to and highlights the uncategorized list, opening no dialog and no panel, for the aggregate uncategorized tributary', async () => {
      const fixture = TestBed.createComponent(AccountStream);
      fixture.componentRef.setInput('id', 'acc-1');
      const component = fixture.componentInstance;
      await component['load']('acc-1');
      fixture.detectChanges();

      component['onTributaryClick']({
        id: 'uncategorized-out-1',
        kind: 'uncategorized',
        direction: 'out',
        date: new Date('2026-07-01'),
        x: 0,
        amount: 40,
        label: 'Uncategorized',
      });

      expect(dialog.open).not.toHaveBeenCalled();
      expect(component['openTributary']()).toBeNull();
      await Promise.resolve(); // let the off->on microtask (re-trigger guard) settle
      expect(component['isUncategorizedHighlighted']()).toBe(true);
    });

    it('re-triggers the highlight (off, then on again) on a repeat click, so the CSS pulse replays', async () => {
      const fixture = TestBed.createComponent(AccountStream);
      fixture.componentRef.setInput('id', 'acc-1');
      const component = fixture.componentInstance;
      await component['load']('acc-1');
      fixture.detectChanges();

      const uncategorizedTributary = {
        id: 'uncategorized-out-1',
        kind: 'uncategorized' as const,
        direction: 'out' as const,
        date: new Date('2026-07-01'),
        x: 0,
        amount: 40,
        label: 'Uncategorized',
      };
      component['onTributaryClick'](uncategorizedTributary);
      await Promise.resolve();
      expect(component['isUncategorizedHighlighted']()).toBe(true);

      component['onTributaryClick'](uncategorizedTributary);
      expect(component['isUncategorizedHighlighted']()).toBe(false);
      await Promise.resolve();
      expect(component['isUncategorizedHighlighted']()).toBe(true);
    });
  });

  describe('Signed-Balance color ribbon (#77)', () => {
    it('renders the constant-width color-encoded ribbon (not the width-based one) for an Asset account whose balance is normal', async () => {
      storage.getAccounts.mockResolvedValue([{ ...account, expectedSign: 1, balance: 1000 }]);

      const fixture = TestBed.createComponent(AccountStream);
      fixture.componentRef.setInput('id', 'acc-1');
      const component = fixture.componentInstance;
      await component['load']('acc-1');
      fixture.detectChanges();

      const fills = fixture.nativeElement.querySelectorAll('.band-fill');
      expect(fixture.nativeElement.querySelectorAll('.segment').length).toBe(0);
      expect(fills.length).toBeGreaterThan(0);
      expect(Array.from(fills as NodeListOf<Element>).every((el) => el.classList.contains('positive'))).toBe(true);
    });

    it('renders the same positive (blue) hue for a Liability account whose balance is normal (negative), via Signed Balance rather than raw balance', async () => {
      storage.getAccounts.mockResolvedValue([{ ...account, expectedSign: -1, balance: -1000 }]);

      const fixture = TestBed.createComponent(AccountStream);
      fixture.componentRef.setInput('id', 'acc-1');
      const component = fixture.componentInstance;
      await component['load']('acc-1');
      fixture.detectChanges();

      const fills = fixture.nativeElement.querySelectorAll('.band-fill');
      expect(fills.length).toBeGreaterThan(0);
      expect(Array.from(fills as NodeListOf<Element>).every((el) => el.classList.contains('positive'))).toBe(true);
    });

    it('renders the negative (brown) hue for a Liability account whose raw balance is positive (opposite of expected)', async () => {
      storage.getAccounts.mockResolvedValue([{ ...account, expectedSign: -1, balance: 1000 }]);

      const fixture = TestBed.createComponent(AccountStream);
      fixture.componentRef.setInput('id', 'acc-1');
      const component = fixture.componentInstance;
      await component['load']('acc-1');
      fixture.detectChanges();

      const fills = fixture.nativeElement.querySelectorAll('.band-fill');
      expect(fills.length).toBeGreaterThan(0);
      expect(Array.from(fills as NodeListOf<Element>).every((el) => el.classList.contains('negative'))).toBe(true);
    });
  });
});
