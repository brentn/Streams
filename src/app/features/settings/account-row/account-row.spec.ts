import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { Account } from '../../../core/models/account';
import { AccountRow } from './account-row';

describe('AccountRow', () => {
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
    await TestBed.configureTestingModule({ imports: [AccountRow] }).compileComponents();
    const fixture = TestBed.createComponent(AccountRow);
    fixture.componentRef.setInput('account', initial);
    fixture.detectChanges();
    return { component: fixture.componentInstance, fixture };
  }

  it('pre-fills the fields from the given Account', async () => {
    const { component } = await createComponent();

    expect(component['name']()).toBe('Checking');
    expect(component['institutionName']()).toBe('Bank');
    expect(component['dryFloor']()).toBe(250);
    expect(component['isDirty']()).toBe(false);
  });

  it('hides the minimum control entirely for a liability account', async () => {
    const liability: Account = { ...account, expectedSign: -1 };
    const { component } = await createComponent(liability);

    expect(component['isLiability']()).toBe(true);
  });

  it('flags dirty once the name diverges from the account', async () => {
    const { component } = await createComponent();

    component['name'].set('Renamed');

    expect(component['isDirty']()).toBe(true);
  });

  it('flags dirty once the institution name diverges from the account', async () => {
    const { component } = await createComponent();

    component['institutionName'].set('New Bank');

    expect(component['isDirty']()).toBe(true);
  });

  it('flags dirty once the minimum diverges from the account, for a non-liability account', async () => {
    const { component } = await createComponent();

    component['dryFloor'].set(500);

    expect(component['isDirty']()).toBe(true);
  });

  it('never flags dirty from a minimum change on a liability account', async () => {
    const liability: Account = { ...account, expectedSign: -1 };
    const { component } = await createComponent(liability);

    component['dryFloor'].set(999);

    expect(component['isDirty']()).toBe(false);
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

  it('does nothing when save is invoked with nothing dirty', async () => {
    const { component } = await createComponent();
    const saved = vi.fn();
    component.saved.subscribe(saved);

    component['save']();

    expect(saved).not.toHaveBeenCalled();
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
