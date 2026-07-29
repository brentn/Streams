import { describe, expect, it } from 'vitest';
import { Account } from '../models/account';
import { bannerPresentation, connectionBannerState, derivedBannerState } from './sync-presentation';

function account(overrides: Partial<Account> = {}): Account {
  return {
    id: 'acc-1',
    name: 'Checking',
    institutionName: 'Bank',
    balance: 100,
    balanceDate: new Date('2026-07-25'),
    expectedSign: 1,
    dryFloor: 0,
    ...overrides,
  };
}

describe('derivedBannerState', () => {
  it('is ok when there is no operation error and no sync status yet', () => {
    expect(derivedBannerState(null, undefined)).toEqual({ kind: 'ok' });
    expect(derivedBannerState(null, { kind: 'ok' })).toEqual({ kind: 'ok' });
  });

  it('prioritizes a transient operation error over persisted sync status', () => {
    expect(derivedBannerState('Re-sync failed.', { kind: 'needs-reauth' })).toEqual({
      kind: 'operation-error',
      message: 'Re-sync failed.',
    });
  });

  it('surfaces needs-reauth over sync-issue when there is no operation error', () => {
    expect(derivedBannerState(null, { kind: 'needs-reauth' })).toEqual({ kind: 'needs-reauth' });
  });

  it('surfaces a sync-issue with its message when nothing higher-priority applies', () => {
    expect(derivedBannerState(null, { kind: 'sync-issue', message: 'Try again later.' })).toEqual({
      kind: 'sync-issue',
      message: 'Try again later.',
    });
  });
});

describe('connectionBannerState', () => {
  it('is ok when no account needs reauthentication', () => {
    expect(connectionBannerState(null, [account(), account({ id: 'acc-2' })])).toEqual({
      kind: 'ok',
    });
  });

  it('prioritizes a transient operation error over every account', () => {
    expect(
      connectionBannerState('Re-sync failed.', [
        account({ syncStatus: { kind: 'needs-reauth' } }),
      ]),
    ).toEqual({ kind: 'operation-error', message: 'Re-sync failed.' });
  });

  it('fans needs-reauth to the connection level when any account has it', () => {
    expect(
      connectionBannerState(null, [
        account({ id: 'acc-1', syncStatus: { kind: 'ok' } }),
        account({ id: 'acc-2', syncStatus: { kind: 'needs-reauth' } }),
      ]),
    ).toEqual({ kind: 'needs-reauth' });
  });

  it('does not surface a per-account sync-issue at the connection level', () => {
    expect(
      connectionBannerState(null, [
        account({ syncStatus: { kind: 'sync-issue', message: 'Try again later.' } }),
      ]),
    ).toEqual({ kind: 'ok' });
  });
});

describe('bannerPresentation', () => {
  it('maps ok to a hidden banner (null message)', () => {
    expect(bannerPresentation({ kind: 'ok' })).toEqual(
      expect.objectContaining({ message: null }),
    );
  });

  it('maps operation-error to critical severity with the raw message and a Retry action', () => {
    expect(bannerPresentation({ kind: 'operation-error', message: 'Re-sync failed.' })).toEqual({
      message: 'Re-sync failed.',
      severity: 'critical',
      retryLabel: 'Retry',
    });
  });

  it('maps needs-reauth to serious severity with a Reauthorize action, never critical', () => {
    const result = bannerPresentation({ kind: 'needs-reauth' });
    expect(result.severity).toBe('serious');
    expect(result.retryLabel).toBe('Reauthorize');
    expect(result.message).toBeTruthy();
  });

  it('maps sync-issue to warning severity with its own message and a Retry action, never critical', () => {
    expect(bannerPresentation({ kind: 'sync-issue', message: 'Try again later.' })).toEqual({
      message: 'Try again later.',
      severity: 'warning',
      retryLabel: 'Retry',
    });
  });
});
