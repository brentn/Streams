import { Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { SyncCoordinator } from './core/sync/sync-coordinator';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly syncCoordinator = inject(SyncCoordinator);

  constructor() {
    void this.syncCoordinator.triggerAutoResyncIfDue();
  }
}
