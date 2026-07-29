import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { Account } from '../../../core/models/account';
import { AccountForm } from './account-form';

describe('AccountForm', () => {
  const account: Account = {
    id: 'acc-1',
    name: 'Checking',
    institutionName: 'Bank',
    balance: 100,
    balanceDate: new Date('2026-07-25'),
    expectedSign: 1,
    dryFloor: 250,
  };

  async function createComponent(initial: Account = account) {
    await TestBed.configureTestingModule({ imports: [AccountForm] }).compileComponents();
    const fixture = TestBed.createComponent(AccountForm);
    fixture.componentRef.setInput('account', initial);
    fixture.detectChanges();
    return { component: fixture.componentInstance, fixture };
  }

  it('pre-fills the fields from the given Account', async () => {
    const { component } = await createComponent();

    expect(component['name']()).toBe('Checking');
    expect(component['institutionName']()).toBe('Bank');
    expect(component['dryFloor']()).toBe(250);
  });

  it('hides the minimum control entirely for a liability account', async () => {
    const liability: Account = { ...account, expectedSign: -1 };
    const { component } = await createComponent(liability);

    expect(component['isLiability']()).toBe(true);
  });

  it('is invalid when the name is blank', async () => {
    const { component } = await createComponent();

    component['name'].set('   ');

    expect(component['isValid']()).toBe(false);
  });

  it('is invalid when the institution name is blank', async () => {
    const { component } = await createComponent();

    component['institutionName'].set('   ');

    expect(component['isValid']()).toBe(false);
  });

  it('is valid with the account unmodified', async () => {
    const { component } = await createComponent();

    expect(component['isValid']()).toBe(true);
  });

  it('emits the updated Account on save, trimming name and institution', async () => {
    const { component } = await createComponent();
    const saved = vi.fn();
    component.saved.subscribe(saved);

    component['name'].set('  Renamed  ');
    component['institutionName'].set('  New Bank  ');
    component['dryFloor'].set(500);
    component['save']();

    expect(saved).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'acc-1', name: 'Renamed', institutionName: 'New Bank', dryFloor: 500 }),
    );
  });

  it('ignores dryFloor edits on a liability account, preserving the stored value on save', async () => {
    const liability: Account = { ...account, expectedSign: -1 };
    const { component } = await createComponent(liability);
    const saved = vi.fn();
    component.saved.subscribe(saved);

    component['name'].set('Renamed');
    component['dryFloor'].set(999);
    component['save']();

    expect(saved).toHaveBeenCalledWith(expect.objectContaining({ dryFloor: 250 }));
  });

  it('does not save when the name is blank', async () => {
    const { component } = await createComponent();
    const saved = vi.fn();
    component.saved.subscribe(saved);

    component['name'].set('   ');
    component['save']();

    expect(saved).not.toHaveBeenCalled();
  });

  it('does not save when the institution name is blank', async () => {
    const { component } = await createComponent();
    const saved = vi.fn();
    component.saved.subscribe(saved);

    component['institutionName'].set('   ');
    component['save']();

    expect(saved).not.toHaveBeenCalled();
  });

  it('emits cancelled when cancel is invoked', async () => {
    const { component } = await createComponent();
    const cancelled = vi.fn();
    component.cancelled.subscribe(cancelled);

    component['cancel']();

    expect(cancelled).toHaveBeenCalled();
  });

  it('keeps the last minimum value when its input is cleared, instead of going NaN', async () => {
    const { component, fixture } = await createComponent();

    const input: HTMLInputElement = fixture.nativeElement.querySelector('input[type="number"]');
    input.value = '';
    input.dispatchEvent(new Event('input'));

    expect(component['dryFloor']()).toBe(250);
  });

  it('re-syncs its fields when the account input changes to a different account', async () => {
    const { component, fixture } = await createComponent();
    component['name'].set('Renamed');

    const other: Account = { ...account, id: 'acc-2', name: 'Savings', dryFloor: 10 };
    fixture.componentRef.setInput('account', other);
    fixture.detectChanges();

    expect(component['name']()).toBe('Savings');
    expect(component['dryFloor']()).toBe(10);
  });
});
