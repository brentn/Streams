import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Account } from '../../../core/models/account';
import { Transfer } from '../../../core/models/transfer';
import { StorageRepository } from '../../../core/storage/storage-repository';
import { TransferList } from './transfer-list';

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

const accounts = [account('acc-1', 'Checking'), account('acc-2', 'Savings')];

function transfer(overrides: Partial<Transfer> = {}): Transfer {
  return {
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
    ...overrides,
  };
}

describe('TransferList', () => {
  let storage: {
    upsertTransfer: ReturnType<typeof vi.fn>;
    deleteTransfer: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    storage = {
      upsertTransfer: vi.fn(),
      deleteTransfer: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [TransferList],
      providers: [{ provide: StorageRepository, useValue: storage }],
    }).compileComponents();
  });

  function createComponent(transfers: Transfer[] = [], accountId = 'acc-1') {
    const fixture = TestBed.createComponent(TransferList);
    fixture.componentRef.setInput('accountId', accountId);
    fixture.componentRef.setInput('accounts', accounts);
    fixture.componentRef.setInput('transfers', transfers);
    return fixture.componentInstance;
  }

  it('describes an outgoing Transfer relative to this account', () => {
    const component = createComponent([transfer()]);

    expect(component['summarize'](transfer())).toContain('Savings');
    expect(component['summarize'](transfer())).toMatch(/out|to/i);
  });

  it('describes an incoming Transfer relative to this account', () => {
    const incoming = transfer({ fromAccountId: 'acc-2', toAccountId: 'acc-1' });
    const component = createComponent([incoming]);

    expect(component['summarize'](incoming)).toContain('Savings');
    expect(component['summarize'](incoming)).toMatch(/in|from/i);
  });

  it('persists a saved Transfer, closes the form, and emits changed', async () => {
    const component = createComponent([]);
    const changed = vi.fn();
    component.changed.subscribe(changed);

    await component['onTransferSaved'](transfer());

    expect(storage.upsertTransfer).toHaveBeenCalledWith(transfer());
    expect(changed).toHaveBeenCalled();
    expect(component['isFormOpen']()).toBe(false);
  });

  it('deletes a Transfer and emits changed', async () => {
    const component = createComponent([transfer()]);
    const changed = vi.fn();
    component.changed.subscribe(changed);

    await component['remove'](transfer());

    expect(storage.deleteTransfer).toHaveBeenCalledWith('transfer-1');
    expect(changed).toHaveBeenCalled();
  });

  it('opens the create form with no editing Transfer', () => {
    const component = createComponent([]);

    component['openCreateForm']();

    expect(component['isFormOpen']()).toBe(true);
    expect(component['editingTransfer']()).toBeNull();
  });

  it('opens the edit form with the given Transfer', () => {
    const component = createComponent([transfer()]);

    component['openEditForm'](transfer());

    expect(component['isFormOpen']()).toBe(true);
    expect(component['editingTransfer']()).toEqual(transfer());
  });

  it('closes the form on cancel', () => {
    const component = createComponent([]);
    component['openCreateForm']();

    component['cancelForm']();

    expect(component['isFormOpen']()).toBe(false);
  });
});
