import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { Account } from '../../../core/models/account';
import { Transfer } from '../../../core/models/transfer';
import { TransferForm } from './transfer-form';

function account(id: string, name: string): Account {
  return {
    id,
    name,
    institutionName: 'Bank',
    balance: 0,
    balanceDate: new Date('2026-01-01'),
    expectedSign: 1,
    dryFloor: 0,
  };
}

const accounts = [
  account('acc-1', 'Checking'),
  account('acc-2', 'Savings'),
  account('acc-3', 'Credit Card'),
];

describe('TransferForm', () => {
  async function createComponent(
    accountId = 'acc-1',
    transfer: Transfer | null = null,
    accountList = accounts,
  ) {
    await TestBed.configureTestingModule({ imports: [TransferForm] }).compileComponents();
    const fixture = TestBed.createComponent(TransferForm);
    fixture.componentRef.setInput('accountId', accountId);
    fixture.componentRef.setInput('accounts', accountList);
    fixture.componentRef.setInput('transfer', transfer);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('excludes the current account from the list of other-account choices', async () => {
    const component = await createComponent('acc-1');

    expect(component['otherAccounts']().map((a) => a.id)).toEqual(['acc-2', 'acc-3']);
  });

  it('emits a new Transfer on save, with this account as the from-side when direction is out', async () => {
    const component = await createComponent('acc-1');
    const saved = vi.fn();
    component.saved.subscribe(saved);

    component['direction'].set('out');
    component['otherAccountId'].set('acc-2');
    component['amount'].set(500);
    component['cadenceOption'].set('monthly');
    component['cadenceFields'].set({ ...component['cadenceFields'](), day: 1 });

    component['save']();

    expect(saved).toHaveBeenCalledWith(
      expect.objectContaining({
        fromAccountId: 'acc-1',
        toAccountId: 'acc-2',
        amount: 500,
        cadence: expect.objectContaining({ period: 'month', interval: 1, anchors: [{ day: 1 }] }),
      }),
    );
  });

  it('emits a new Transfer on save, with this account as the to-side when direction is in', async () => {
    const component = await createComponent('acc-1');
    const saved = vi.fn();
    component.saved.subscribe(saved);

    component['direction'].set('in');
    component['otherAccountId'].set('acc-3');
    component['amount'].set(200);

    component['save']();

    expect(saved).toHaveBeenCalledWith(
      expect.objectContaining({ fromAccountId: 'acc-3', toAccountId: 'acc-1' }),
    );
  });

  it('pre-fills direction and the other account from an existing Transfer where this account is the from-side', async () => {
    const transfer: Transfer = {
      id: 'transfer-1',
      fromAccountId: 'acc-1',
      toAccountId: 'acc-2',
      amount: 500,
      cadence: {
        period: 'month',
        interval: 1,
        anchors: [{ day: 1 }],
        anchorDate: new Date(2026, 0, 1),
      },
    };

    const component = await createComponent('acc-1', transfer);

    expect(component['direction']()).toBe('out');
    expect(component['otherAccountId']()).toBe('acc-2');
    expect(component['amount']()).toBe(500);
  });

  it('pre-fills direction and the other account from an existing Transfer where this account is the to-side', async () => {
    const transfer: Transfer = {
      id: 'transfer-1',
      fromAccountId: 'acc-3',
      toAccountId: 'acc-1',
      amount: 200,
      cadence: {
        period: 'month',
        interval: 1,
        anchors: [{ day: 15 }],
        anchorDate: new Date(2026, 0, 1),
      },
    };

    const component = await createComponent('acc-1', transfer);

    expect(component['direction']()).toBe('in');
    expect(component['otherAccountId']()).toBe('acc-3');
  });

  it('saves an edit with the same id', async () => {
    const transfer: Transfer = {
      id: 'transfer-1',
      fromAccountId: 'acc-1',
      toAccountId: 'acc-2',
      amount: 500,
      cadence: {
        period: 'month',
        interval: 1,
        anchors: [{ day: 1 }],
        anchorDate: new Date(2026, 0, 1),
      },
    };
    const component = await createComponent('acc-1', transfer);
    const saved = vi.fn();
    component.saved.subscribe(saved);

    component['amount'].set(750);
    component['save']();

    expect(saved).toHaveBeenCalledWith(expect.objectContaining({ id: 'transfer-1', amount: 750 }));
  });

  it('includes amountChanges on save', async () => {
    const component = await createComponent('acc-1');
    const saved = vi.fn();
    component.saved.subscribe(saved);

    component['direction'].set('out');
    component['otherAccountId'].set('acc-2');
    component['amountChanges'].set([
      { type: 'step', effectiveDate: new Date(2027, 0, 1), amount: 600 },
    ]);

    component['save']();

    expect(saved).toHaveBeenCalledWith(
      expect.objectContaining({
        amountChanges: [{ type: 'step', effectiveDate: new Date(2027, 0, 1), amount: 600 }],
      }),
    );
  });

  it('blocks save when the cadence has an End Date before its anchor date', async () => {
    const component = await createComponent('acc-1');
    const saved = vi.fn();
    component.saved.subscribe(saved);

    component['direction'].set('out');
    component['otherAccountId'].set('acc-2');
    component['cadenceOption'].set('monthly');
    component['cadenceFields'].set({
      ...component['cadenceFields'](),
      anchorDate: new Date(2026, 5, 1),
      endDate: new Date(2026, 0, 1),
    });

    component['save']();

    expect(saved).not.toHaveBeenCalled();
  });

  it('emits cancelled without emitting saved', async () => {
    const component = await createComponent('acc-1');
    const saved = vi.fn();
    const cancelled = vi.fn();
    component.saved.subscribe(saved);
    component.cancelled.subscribe(cancelled);

    component['cancel']();

    expect(cancelled).toHaveBeenCalled();
    expect(saved).not.toHaveBeenCalled();
  });
});
