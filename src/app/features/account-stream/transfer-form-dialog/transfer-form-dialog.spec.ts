import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { Account } from '../../../core/models/account';
import { Transfer } from '../../../core/models/transfer';
import { TransferFormDialog, TransferFormDialogData } from './transfer-form-dialog';

const accounts: Account[] = [
  {
    id: 'acc-1',
    name: 'Checking',
    institutionName: 'Bank',
    balance: 0,
    balanceDate: new Date('2026-07-01'),
    expectedSign: 1,
    dryFloor: 0,
  },
  {
    id: 'acc-2',
    name: 'Savings',
    institutionName: 'Bank',
    balance: 0,
    balanceDate: new Date('2026-07-01'),
    expectedSign: 1,
    dryFloor: 0,
  },
];

const newTransfer: Transfer = {
  id: 'transfer-1',
  fromAccountId: 'acc-1',
  toAccountId: 'acc-2',
  amount: 200,
  cadence: { period: 'once', date: new Date('2026-07-10') },
};

describe('TransferFormDialog', () => {
  let dialogRef: { close: ReturnType<typeof vi.fn> };

  function createComponent(data: TransferFormDialogData) {
    dialogRef = { close: vi.fn() };
    TestBed.configureTestingModule({
      imports: [TransferFormDialog],
      providers: [
        { provide: DialogRef, useValue: dialogRef },
        { provide: DIALOG_DATA, useValue: data },
      ],
    });
    return TestBed.createComponent(TransferFormDialog).componentInstance;
  }

  it('closes with the saved Transfer', () => {
    const component = createComponent({ accountId: 'acc-1', accounts });

    component['onSaved'](newTransfer);

    expect(dialogRef.close).toHaveBeenCalledWith(newTransfer);
  });

  it('closes with no result on cancel', () => {
    const component = createComponent({ accountId: 'acc-1', accounts });

    component['onCancelled']();

    expect(dialogRef.close).toHaveBeenCalledWith();
  });

  it("closes with 'deleted' on delete", () => {
    const component = createComponent({ accountId: 'acc-1', accounts, transfer: newTransfer });

    component['onDeleted']();

    expect(dialogRef.close).toHaveBeenCalledWith('deleted');
  });

  it('passes the given Transfer through for edit mode', () => {
    const component = createComponent({ accountId: 'acc-1', accounts, transfer: newTransfer });

    expect(component['data'].transfer).toBe(newTransfer);
  });
});
