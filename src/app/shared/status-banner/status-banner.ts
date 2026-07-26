import { Component, input, output } from '@angular/core';

/**
 * Shared error/loading treatment per docs/ux-spec.md ("Error / loading
 * states: inline banner"): a persistent in-flow banner for errors (icon +
 * message + its own Retry button), and a slim indeterminate progress bar
 * under the header while syncing. Not a toast, not folded into header text.
 */
@Component({
  selector: 'app-status-banner',
  templateUrl: './status-banner.html',
  styleUrl: './status-banner.css',
})
export class StatusBanner {
  readonly errorMessage = input<string | null>(null);
  readonly isSyncing = input(false);
  readonly retry = output<void>();
}
