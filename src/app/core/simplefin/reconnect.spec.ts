import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openSimpleFinBridge, SIMPLEFIN_BRIDGE_URL } from './reconnect';

describe('openSimpleFinBridge', () => {
  beforeEach(() => {
    vi.stubGlobal('open', vi.fn());
  });

  it('opens the SimpleFIN Bridge in a new tab, where the user re-links and handles any bank 2FA', () => {
    openSimpleFinBridge();

    expect(window.open).toHaveBeenCalledWith(SIMPLEFIN_BRIDGE_URL, '_blank', 'noopener,noreferrer');
  });
});
