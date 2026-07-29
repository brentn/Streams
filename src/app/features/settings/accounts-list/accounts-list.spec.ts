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

  it('resolves no Account to edit when editingAccountId is unset', async () => {
    const { component } = await createComponent();

    expect(component['editingAccount']()).toBeNull();
  });

  it('resolves the matching Account once editingAccountId is set', async () => {
    const { component, fixture } = await createComponent();
    fixture.componentRef.setInput('editingAccountId', 'acc-2');
    fixture.detectChanges();

    expect(component['editingAccount']()).toEqual(creditCard);
  });

  it('emits edit with the clicked Account id', async () => {
    const { component, fixture } = await createComponent();
    const edit = vi.fn();
    component.edit.subscribe(edit);

    const editButtons = fixture.nativeElement.querySelectorAll('.actions button');
    (editButtons[0] as HTMLButtonElement).click();

    expect(edit).toHaveBeenCalledWith('acc-1');
  });

  it('shows the account form once editingAccountId matches an Account', async () => {
    const { fixture } = await createComponent();
    fixture.componentRef.setInput('editingAccountId', 'acc-1');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-account-form')).toBeTruthy();
  });

  it('does not show the account form when nothing is being edited', async () => {
    const { fixture } = await createComponent();

    expect(fixture.nativeElement.querySelector('app-account-form')).toBeNull();
  });
});
