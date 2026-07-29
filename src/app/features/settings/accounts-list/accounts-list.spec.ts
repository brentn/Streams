import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { Account } from '../../../core/models/account';
import { AccountsList } from './accounts-list';

describe('AccountsList', () => {
  const checking: Account = {
    id: 'acc-1',
    name: 'Checking',
    institutionName: 'Bank',
    balance: 100,
    balanceDate: new Date('2026-07-25'),
    expectedSign: 1,
    dryFloor: 250,
  };
  const creditCard: Account = {
    id: 'acc-2',
    name: 'Credit Card',
    institutionName: 'Other Bank',
    balance: -400,
    balanceDate: new Date('2026-07-25'),
    expectedSign: -1,
    dryFloor: 0,
  };

  async function createComponent(accounts: Account[] = [checking, creditCard]) {
    await TestBed.configureTestingModule({ imports: [AccountsList] }).compileComponents();
    const fixture = TestBed.createComponent(AccountsList);
    fixture.componentRef.setInput('accounts', accounts);
    fixture.detectChanges();
    return { component: fixture.componentInstance, fixture };
  }

  it('renders every row read-only when nothing is being edited', async () => {
    const { fixture } = await createComponent();

    expect(fixture.nativeElement.querySelectorAll('app-account-form').length).toBe(0);
    expect(fixture.nativeElement.querySelectorAll('.actions button').length).toBe(2);
  });

  it('emits edit with the clicked Account id', async () => {
    const { component, fixture } = await createComponent();
    const edit = vi.fn();
    component.edit.subscribe(edit);

    const editButtons = fixture.nativeElement.querySelectorAll('.actions button');
    (editButtons[0] as HTMLButtonElement).click();

    expect(edit).toHaveBeenCalledWith('acc-1');
  });

  it('swaps only the matching row for the account form, leaving other rows read-only', async () => {
    const { fixture } = await createComponent();
    fixture.componentRef.setInput('editingAccountId', 'acc-2');
    fixture.detectChanges();

    const rows = fixture.nativeElement.querySelectorAll('.row');
    expect(rows[0].querySelector('app-account-form')).toBeNull();
    expect(rows[0].querySelector('.actions button')).toBeTruthy();
    expect(rows[1].querySelector('app-account-form')).toBeTruthy();
    expect(rows[1].querySelector('.actions button')).toBeNull();
  });

  it('applies the editing class to the row being edited only', async () => {
    const { fixture } = await createComponent();
    fixture.componentRef.setInput('editingAccountId', 'acc-2');
    fixture.detectChanges();

    const rows = fixture.nativeElement.querySelectorAll('.row');
    expect(rows[0].classList.contains('editing')).toBe(false);
    expect(rows[1].classList.contains('editing')).toBe(true);
  });
});
