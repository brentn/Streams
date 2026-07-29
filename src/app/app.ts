import { Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { SyncCoordinator } from './core/sync/sync-coordinator';
import { SettingsIcon } from './shared/settings-icon/settings-icon';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, SettingsIcon],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly syncCoordinator = inject(SyncCoordinator);

  constructor() {
    void this.syncCoordinator.triggerAutoResyncIfDue();
  }
}
