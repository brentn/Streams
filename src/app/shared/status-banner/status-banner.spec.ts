import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { StatusBanner } from './status-banner';

describe('StatusBanner', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [StatusBanner] }).compileComponents();
  });

  function createComponent(inputs: {
    errorMessage?: string | null;
    severity?: 'critical' | 'serious' | 'warning';
    retryLabel?: string;
  }) {
    const fixture = TestBed.createComponent(StatusBanner);
    if (inputs.errorMessage !== undefined) {
      fixture.componentRef.setInput('errorMessage', inputs.errorMessage);
    }
    if (inputs.severity !== undefined) {
      fixture.componentRef.setInput('severity', inputs.severity);
    }
    if (inputs.retryLabel !== undefined) {
      fixture.componentRef.setInput('retryLabel', inputs.retryLabel);
    }
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('defaults to critical severity with no severity modifier class', async () => {
    const el = createComponent({ errorMessage: 'Re-sync failed.' });

    const banner = el.querySelector('.error-banner');
    expect(banner?.classList.contains('severity-serious')).toBe(false);
    expect(banner?.classList.contains('severity-warning')).toBe(false);
  });

  it('applies the serious modifier class for needs-reauth-style banners', async () => {
    const el = createComponent({
      errorMessage: 'Your SimpleFIN connection needs to be reconnected.',
      severity: 'serious',
    });

    expect(el.querySelector('.error-banner')?.classList.contains('severity-serious')).toBe(true);
  });

  it('applies the warning modifier class for sync-issue-style banners', async () => {
    const el = createComponent({ errorMessage: 'Try again later.', severity: 'warning' });

    expect(el.querySelector('.error-banner')?.classList.contains('severity-warning')).toBe(true);
  });

  it('defaults the action button label to Retry, overridable by callers', async () => {
    const withDefault = createComponent({ errorMessage: 'x' });
    expect(withDefault.querySelector('.retry')?.textContent?.trim()).toBe('Retry');

    const withCustom = createComponent({ errorMessage: 'x', retryLabel: 'Reconnect' });
    expect(withCustom.querySelector('.retry')?.textContent?.trim()).toBe('Reconnect');
  });
});
