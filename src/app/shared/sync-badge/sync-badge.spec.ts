import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { SyncBadge } from './sync-badge';

describe('SyncBadge', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [SyncBadge] }).compileComponents();
  });

  it('exposes the sync-issue message as an accessible label and tooltip', () => {
    const fixture = TestBed.createComponent(SyncBadge);
    fixture.componentRef.setInput('message', 'Try again later.');
    fixture.detectChanges();

    const badge = (fixture.nativeElement as HTMLElement).querySelector('.sync-badge');
    expect(badge?.getAttribute('aria-label')).toBe('Sync issue: Try again later.');
    expect(badge?.getAttribute('title')).toBe('Try again later.');
  });
});
