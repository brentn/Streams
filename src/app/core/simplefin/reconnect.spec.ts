import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SIMPLEFIN_BRIDGE_URL, startReconnect } from './reconnect';

describe('startReconnect', () => {
  let router: { navigateByUrl: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    router = { navigateByUrl: vi.fn() };
    vi.stubGlobal('open', vi.fn());
  });

  it('opens the SimpleFIN Bridge in a new tab, where the user re-links and handles any bank 2FA', () => {
    startReconnect(router as never);

    expect(window.open).toHaveBeenCalledWith(SIMPLEFIN_BRIDGE_URL, '_blank', 'noopener,noreferrer');
  });

  it('also navigates to /connect, the only place to paste the fresh setup token', () => {
    startReconnect(router as never);

    expect(router.navigateByUrl).toHaveBeenCalledWith('/connect');
  });
});
