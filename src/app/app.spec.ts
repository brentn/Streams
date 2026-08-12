import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { SyncCoordinator } from './core/sync/sync-coordinator';

describe('App', () => {
  let syncCoordinator: {
    triggerAutoResyncIfDue: ReturnType<typeof vi.fn>;
    isSyncing: ReturnType<typeof signal<boolean>>;
    resync: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    syncCoordinator = {
      triggerAutoResyncIfDue: vi.fn().mockResolvedValue(undefined),
      isSyncing: signal(false),
      resync: vi.fn().mockResolvedValue(undefined),
    };

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

  it('links the brand (logo + name) to the accounts home page', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const brand = compiled.querySelector('.brand');
    expect(brand?.tagName).toBe('A');
    expect(brand?.getAttribute('href')).toBe('/accounts');
  });

  it('keeps the header pinned to the top of the viewport while scrolling', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const header = fixture.nativeElement.querySelector('.app-header');
    expect(getComputedStyle(header).position).toBe('sticky');
  });

  it('renders the settings entry point as a labeled cog icon', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const settingsLink = compiled.querySelector('.settings-link');
    expect(settingsLink?.getAttribute('aria-label')).toBe('Settings');
    expect(settingsLink?.querySelector('app-settings-icon')).toBeTruthy();
  });

  it('renders the re-sync button next to the settings entry point', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const actions = compiled.querySelector('.actions');
    const resyncButton = actions?.querySelector('.resync');
    expect(resyncButton?.querySelector('app-resync-icon')).toBeTruthy();
    expect(actions?.querySelector('.settings-link')).toBeTruthy();
  });

  it('resyncs via the SyncCoordinator when the re-sync button is clicked', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const resyncButton = compiled.querySelector<HTMLButtonElement>('.resync');

    resyncButton?.click();

    expect(syncCoordinator.resync).toHaveBeenCalledOnce();
  });

  it('disables the re-sync button and labels it "Syncing…" while a sync is in flight', async () => {
    syncCoordinator.isSyncing.set(true);
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    const resyncButton = compiled.querySelector<HTMLButtonElement>('.resync');

    expect(resyncButton?.disabled).toBe(true);
    expect(resyncButton?.getAttribute('aria-label')).toBe('Syncing…');
  });
});
