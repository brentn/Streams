import { Dialog } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Account } from '../../../core/models/account';
import { Flow, RecurringFlow } from '../../../core/models/flow';
import { SkippedOccurrence } from '../../../core/models/skipped-occurrence';
import { Transaction } from '../../../core/models/transaction';
import { StorageRepository } from '../../../core/storage/storage-repository';
import { OutstandingFlowRow } from './outstanding-flow-row';
import { ResolveOutstandingDialog, ResolveOutstandingDialogResult } from './resolve-outstanding-dialog/resolve-outstanding-dialog';

const account: Account = {
  id: 'acc-1',
  name: 'Checking',
  institutionName: 'Bank',
  balance: 1000,
  balanceDate: new Date(),
  expectedSign: 1,
  dryFloor: 0,
};

const now = new Date();
const daysAgo = (n: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - n);

function onceFlow(id: string, name: string, direction: 'in' | 'out', occurrence: Date): RecurringFlow {
  return {
    id,
    accountId: 'acc-1',
    name,
    direction,
    kind: 'recurring',
    amount: 100,
    cadence: { period: 'once', date: occurrence },
  };
}

describe('OutstandingFlowRow', () => {
  let storage: {
    getCategorizationRules: ReturnType<typeof vi.fn>;
    upsertCategorizationRule: ReturnType<typeof vi.fn>;
    upsertTransactions: ReturnType<typeof vi.fn>;
    upsertSkippedOccurrence: ReturnType<typeof vi.fn>;
  };
  let dialog: { open: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    storage = {
      getCategorizationRules: vi.fn().mockResolvedValue([]),
      upsertCategorizationRule: vi.fn().mockResolvedValue(undefined),
      upsertTransactions: vi.fn().mockResolvedValue(undefined),
      upsertSkippedOccurrence: vi.fn().mockResolvedValue(undefined),
    };
    dialog = { open: vi.fn().mockReturnValue({ closed: new Subject<ResolveOutstandingDialogResult | undefined>() }) };
  });

  async function createComponent(
    flows: Flow[] = [],
    transactions: Transaction[] = [],
    skippedOccurrences: SkippedOccurrence[] = [],
  ) {
    await TestBed.configureTestingModule({
      imports: [OutstandingFlowRow],
      providers: [
        { provide: StorageRepository, useValue: storage },
        { provide: Dialog, useValue: dialog },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(OutstandingFlowRow);
    fixture.componentRef.setInput('flows', flows);
    fixture.componentRef.setInput('transactions', transactions);
    fixture.componentRef.setInput('account', account);
    fixture.componentRef.setInput('skippedOccurrences', skippedOccurrences);
    fixture.detectChanges();
    return fixture;
  }

  it('renders nothing when there are no Outstanding Flows', async () => {
    const notYetDue = onceFlow('f1', 'Rent', 'out', daysAgo(-3));
    const fixture = await createComponent([notYetDue]);

    expect(fixture.nativeElement.querySelector('.outstanding-row')).toBeNull();
  });

  it('titles the strip "Outstanding Transactions"', async () => {
    const rent = onceFlow('f1', 'Rent', 'out', daysAgo(3));
    const fixture = await createComponent([rent]);

    expect(fixture.nativeElement.querySelector('h2')?.textContent).toBe('Outstanding Transactions');
  });

  it('renders a tile for a currently-Outstanding recurring Flow, showing its due date and name', async () => {
    const rent = onceFlow('f1', 'Rent', 'out', daysAgo(3));
    const fixture = await createComponent([rent]);

    const tiles = fixture.nativeElement.querySelectorAll('.tile');
    expect(tiles.length).toBe(1);
    expect(tiles[0].textContent).toContain('Rent');
  });

  it('includes an Outstanding income Flow, not just expense Flows', async () => {
    const paycheck = onceFlow('f1', 'Paycheck', 'in', daysAgo(3));
    const fixture = await createComponent([paycheck]);

    const tiles = fixture.nativeElement.querySelectorAll('.tile');
    expect(tiles.length).toBe(1);
    expect(tiles[0].textContent).toContain('Paycheck');
  });

  it('excludes a Flow whose occurrence has a matching Transaction', async () => {
    const rent = onceFlow('f1', 'Rent', 'out', daysAgo(3));
    const matched: Transaction = {
      id: 'txn-1',
      accountId: 'acc-1',
      date: daysAgo(3),
      amount: -100,
      description: 'rent payment',
      matchedTarget: { kind: 'flow', id: 'f1' },
    };
    const fixture = await createComponent([rent], [matched]);

    expect(fixture.nativeElement.querySelector('.outstanding-row')).toBeNull();
  });

  it('excludes a Flow occurrence recorded as a Skipped Occurrence (#95)', async () => {
    const rent = onceFlow('f1', 'Rent', 'out', daysAgo(3));
    const skipped: SkippedOccurrence = { flowId: 'f1', occurrenceDate: daysAgo(3) };
    const fixture = await createComponent([rent], [], [skipped]);

    expect(fixture.nativeElement.querySelector('.outstanding-row')).toBeNull();
  });

  it('excludes a budget-kind Flow, which has no single occurrence to be Outstanding', async () => {
    const budget: Flow = {
      id: 'f1',
      accountId: 'acc-1',
      name: 'Groceries',
      direction: 'out',
      kind: 'budget',
      limit: 400,
      period: 'month',
    };
    const fixture = await createComponent([budget]);

    expect(fixture.nativeElement.querySelector('.outstanding-row')).toBeNull();
  });

  it('orders tiles oldest-occurrence-first', async () => {
    const recent = onceFlow('f1', 'Recent', 'out', daysAgo(1));
    const older = onceFlow('f2', 'Older', 'out', daysAgo(5));
    const fixture = await createComponent([recent, older]);

    const names = Array.from(fixture.nativeElement.querySelectorAll('.name')).map(
      (el) => (el as HTMLElement).textContent,
    );
    expect(names).toEqual(['Older', 'Recent']);
  });

  describe('clicking a tile (#97)', () => {
    it('opens ResolveOutstandingDialog with the Flow, occurrence, amount, transactions, and Categorization Rules', async () => {
      const rent = onceFlow('f1', 'Rent', 'out', daysAgo(3));
      const rules = [{ matchText: 'rent payment', target: { kind: 'flow' as const, id: 'f1' } }];
      storage.getCategorizationRules.mockResolvedValue(rules);
      dialog.open.mockReturnValue({ closed: new Subject<ResolveOutstandingDialogResult | undefined>() });
      const fixture = await createComponent([rent]);

      const tile = fixture.nativeElement.querySelector('.tile') as HTMLElement;
      tile.click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(dialog.open).toHaveBeenCalledWith(ResolveOutstandingDialog, {
        data: {
          flow: rent,
          occurrenceDate: daysAgo(3),
          amount: 100,
          transactions: [],
          categorizationRules: rules,
        },
      });
    });

    it('persists an assign result via applyAssignment and emits changed', async () => {
      const rent = onceFlow('f1', 'Rent', 'out', daysAgo(3));
      const fixture = await createComponent([rent]);
      const component = fixture.componentInstance;
      const changed = vi.fn();
      component.changed.subscribe(changed);
      const closed = new Subject<ResolveOutstandingDialogResult | undefined>();
      dialog.open.mockReturnValue({ closed });

      (fixture.nativeElement.querySelector('.tile') as HTMLElement).click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      closed.next({ kind: 'assign', matchText: 'rent payment', target: { kind: 'flow', id: 'f1' } });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(storage.upsertCategorizationRule).toHaveBeenCalledWith({
        matchText: 'rent payment',
        target: { kind: 'flow', id: 'f1' },
      });
      expect(changed).toHaveBeenCalled();
    });

    it('persists a skip result via storage and emits changed', async () => {
      const rent = onceFlow('f1', 'Rent', 'out', daysAgo(3));
      const fixture = await createComponent([rent]);
      const component = fixture.componentInstance;
      const changed = vi.fn();
      component.changed.subscribe(changed);
      const closed = new Subject<ResolveOutstandingDialogResult | undefined>();
      dialog.open.mockReturnValue({ closed });

      (fixture.nativeElement.querySelector('.tile') as HTMLElement).click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      closed.next({ kind: 'skip', flowId: 'f1', occurrenceDate: daysAgo(3) });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(storage.upsertSkippedOccurrence).toHaveBeenCalledWith({ flowId: 'f1', occurrenceDate: daysAgo(3) });
      expect(changed).toHaveBeenCalled();
    });

    it('does nothing when the dialog closes with no result', async () => {
      const rent = onceFlow('f1', 'Rent', 'out', daysAgo(3));
      const fixture = await createComponent([rent]);
      const component = fixture.componentInstance;
      const changed = vi.fn();
      component.changed.subscribe(changed);
      const closed = new Subject<ResolveOutstandingDialogResult | undefined>();
      dialog.open.mockReturnValue({ closed });

      (fixture.nativeElement.querySelector('.tile') as HTMLElement).click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      closed.next(undefined);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(storage.upsertCategorizationRule).not.toHaveBeenCalled();
      expect(storage.upsertSkippedOccurrence).not.toHaveBeenCalled();
      expect(changed).not.toHaveBeenCalled();
    });
  });
});
