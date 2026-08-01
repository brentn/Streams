import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { SyncCoordinator } from './core/sync/sync-coordinator';
import { ResyncIcon } from './shared/resync-icon/resync-icon';
import { SettingsIcon } from './shared/settings-icon/settings-icon';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, ResyncIcon, SettingsIcon],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly syncCoordinator = inject(SyncCoordinator);

  protected readonly isSyncing = this.syncCoordinator.isSyncing;
  protected readonly resyncLabel = computed(() => (this.isSyncing() ? 'Syncing…' : 'Re-sync'));

  constructor() {
    void this.syncCoordinator.triggerAutoResyncIfDue();
  }

  protected async resync(): Promise<void> {
    await this.syncCoordinator.resync();
  }
}
