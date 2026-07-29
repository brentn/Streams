import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { SyncCoordinator } from './core/sync/sync-coordinator';

describe('App', () => {
  let syncCoordinator: { triggerAutoResyncIfDue: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    syncCoordinator = { triggerAutoResyncIfDue: vi.fn().mockResolvedValue(undefined) };

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), { provide: SyncCoordinator, useValue: syncCoordinator }],
    }).compileComponents();
  });

  it('triggers the once-daily auto-resync on startup', () => {
    TestBed.createComponent(App);

    expect(syncCoordinator.triggerAutoResyncIfDue).toHaveBeenCalledOnce();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('renders the app title', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Streams');
  });

  it('renders the settings entry point as a labeled cog icon', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const settingsLink = compiled.querySelector('.settings-link');
    expect(settingsLink?.getAttribute('aria-label')).toBe('Settings');
    expect(settingsLink?.querySelector('app-settings-icon')).toBeTruthy();
  });
});
