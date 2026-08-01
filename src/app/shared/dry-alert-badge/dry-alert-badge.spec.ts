import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { DryAlertBadge } from './dry-alert-badge';

describe('DryAlertBadge', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DryAlertBadge] }).compileComponents();
  });

  it('exposes the projected balance and date as an accessible label and tooltip', () => {
    const fixture = TestBed.createComponent(DryAlertBadge);
    fixture.componentRef.setInput('alert', { date: new Date(2026, 7, 15), balance: -42.5 });
    fixture.detectChanges();

    const badge = (fixture.nativeElement as HTMLElement).querySelector('.dry-alert-badge');
    expect(badge?.getAttribute('aria-label')).toBe(
      'Running-Dry Alert: projected to drop to -$42.50 on Aug 15, 2026',
    );
    expect(badge?.getAttribute('title')).toBe('Projected to drop to -$42.50 on Aug 15, 2026');
  });
});
